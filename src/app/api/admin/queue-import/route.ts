import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE-BASED IMPORT API
// Handles large CSV imports (25K+) by queuing them and processing in background
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 60; // This endpoint just queues, doesn't process

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rramkmudzrxaipukueuq.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabase;
}

interface QueueImportRequest {
  adminIdToken: string;
  rows: any[];
  enrollmentType?: "csv" | "manual";
  adminEmail: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: QueueImportRequest = await request.json();
    const { adminIdToken, rows, enrollmentType = "csv", adminEmail } = body;

    // Validate admin token
    if (!adminIdToken) {
      return NextResponse.json(
        { success: false, error: "Admin authentication required" },
        { status: 401 }
      );
    }

    // Create import job in database
    const jobId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const { data: job, error: jobError } = await getSupabase()
      .from("import_jobs")
      .insert({
        job_id: jobId,
        admin_email: adminEmail,
        total_rows: rows.length,
        status: "queued",
        rows_data: rows,
        enrollment_type: enrollmentType,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create import job:", jobError);
      return NextResponse.json(
        { success: false, error: "Failed to queue import job" },
        { status: 500 }
      );
    }

    // Trigger background processing
    // The processor will poll for queued jobs and process them
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/admin/process-import-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    }).catch(err => console.error("Failed to trigger processor:", err));

    return NextResponse.json({
      success: true,
      jobId,
      message: "Import job queued successfully. Processing will begin shortly.",
      estimatedTime: `${Math.ceil(rows.length / 100)} minutes`,
    });

  } catch (error: any) {
    console.error("Queue import error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to queue import" },
      { status: 500 }
    );
  }
}

// GET endpoint to check job status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Job ID required" },
        { status: 400 }
      );
    }

    const { data: job, error } = await getSupabase()
      .from("import_jobs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        jobId: job.job_id,
        status: job.status,
        totalRows: job.total_rows,
        processedRows: job.processed_rows || 0,
        successCount: job.success_count || 0,
        failedCount: job.failed_count || 0,
        duplicateCount: job.duplicate_count || 0,
        errorMessage: job.error_message,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        progress: job.total_rows > 0 
          ? Math.round(((job.processed_rows || 0) / job.total_rows) * 100)
          : 0,
      },
    });

  } catch (error: any) {
    console.error("Get job status error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
