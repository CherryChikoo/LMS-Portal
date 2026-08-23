import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND IMPORT PROCESSOR
// Processes queued import jobs in chunks to avoid timeouts
// Each invocation processes up to 300 students (takes ~30-40 seconds)
// For 25K students, this will be called ~85 times automatically
// ═══════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Each chunk processes in under 60s

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rramkmudzrxaipukueuq.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabase;
}

const CHUNK_SIZE = 300; // Process 300 students per API call
const DEFAULT_PASSWORD = process.env.DEFAULT_STUDENT_PASSWORD || "Welcome@123";

interface ProcessResult {
  success: number;
  failed: number;
  duplicates: number;
}

function collegeNameToId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function generateSecurePassword(): string {
  return DEFAULT_PASSWORD;
}

async function processChunk(rows: any[], enrollmentType: string): Promise<ProcessResult> {
  const result: ProcessResult = { success: 0, failed: 0, duplicates: 0 };
  
  try {
    // Get existing emails to check duplicates
    const emails = rows.map(r => r.collegeEmail?.toLowerCase()).filter(Boolean);
    const { data: existingUsers } = await getSupabase()
      .from("users")
      .select("email")
      .in("email", emails);
    
    const existingEmailSet = new Set(
      existingUsers?.map(u => u.email.toLowerCase()) || []
    );

    // Process each student
    for (const row of rows) {
      try {
        const email = row.collegeEmail?.trim().toLowerCase();
        const name = row.studentName?.trim();

        if (!email || !name) {
          result.failed++;
          continue;
        }

        // Check duplicate
        if (existingEmailSet.has(email)) {
          result.duplicates++;
          continue;
        }

        // Generate UID
        const uid = `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const password = generateSecurePassword();

        // Create auth user
        const { data: authUser, error: authError } = await getSupabase().auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            displayName: name,
            role: "student",
          },
        });

        if (authError) {
          console.error(`Auth error for ${email}:`, authError);
          result.failed++;
          continue;
        }

        const authUid = authUser.user.id;
        const collegeId = row.college ? collegeNameToId(row.college) : null;

        // Create user record
        await prisma.users.create({
          data: {
            uid: authUid,
            email,
            name,
            displayName: name,
            role: "student",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Create student record
        await prisma.students.create({
          data: {
            uid: authUid,
            name,
            email,
            collegeId,
            department: row.department || "General",
            academicYear: row.academicYear || "1st Year",
            section: row.section || "A",
            batch: row.batch || new Date().getFullYear().toString(),
            enrollmentType,
            enrolledAt: new Date(),
            lastActive: new Date(),
          },
        });

        existingEmailSet.add(email);
        result.success++;

      } catch (rowError: any) {
        console.error("Row processing error:", rowError);
        result.failed++;
      }
    }

  } catch (error: any) {
    console.error("Chunk processing error:", error);
    throw error;
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

    // Get the job
    const { data: job, error: jobError } = await getSupabase()
      .from("import_jobs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    // Check if already processing or completed
    if (job.status === "processing" || job.status === "completed") {
      return NextResponse.json({
        success: true,
        message: "Job already being processed or completed",
      });
    }

    // Mark as processing
    await getSupabase()
      .from("import_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("job_id", jobId);

    // Get rows to process
    const allRows = job.rows_data || [];
    const processedRows = job.processed_rows || 0;
    const remainingRows = allRows.slice(processedRows);
    const currentChunk = remainingRows.slice(0, CHUNK_SIZE);

    if (currentChunk.length === 0) {
      // All done!
      await getSupabase()
        .from("import_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("job_id", jobId);

      return NextResponse.json({
        success: true,
        message: "Import job completed",
      });
    }

    // Process this chunk
    const result = await processChunk(currentChunk, job.enrollment_type || "csv");

    // Update job progress
    const newProcessedRows = processedRows + currentChunk.length;
    const newSuccessCount = (job.success_count || 0) + result.success;
    const newFailedCount = (job.failed_count || 0) + result.failed;
    const newDuplicateCount = (job.duplicate_count || 0) + result.duplicates;

    const isComplete = newProcessedRows >= allRows.length;

    await getSupabase()
      .from("import_jobs")
      .update({
        processed_rows: newProcessedRows,
        success_count: newSuccessCount,
        failed_count: newFailedCount,
        duplicate_count: newDuplicateCount,
        status: isComplete ? "completed" : "processing",
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq("job_id", jobId);

    // If not complete, trigger next chunk
    if (!isComplete) {
      setTimeout(() => {
        fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/admin/process-import-queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        }).catch(err => console.error("Failed to trigger next chunk:", err));
      }, 1000); // 1 second delay between chunks
    }

    return NextResponse.json({
      success: true,
      processed: newProcessedRows,
      total: allRows.length,
      progress: Math.round((newProcessedRows / allRows.length) * 100),
      isComplete,
    });

  } catch (error: any) {
    console.error("Process import queue error:", error);
    
    // Mark job as failed
    const { jobId } = await request.json();
    if (jobId) {
      await getSupabase()
        .from("import_jobs")
        .update({
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq("job_id", jobId);
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}