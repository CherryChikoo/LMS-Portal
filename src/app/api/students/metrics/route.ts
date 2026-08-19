import { NextRequest, NextResponse } from "next/server";
import { getDatabaseMetricsAction } from "@/lib/actions/student-actions-optimized";

/**
 * API Route: GET /api/students/metrics
 * 
 * Returns database-level metrics including master student count,
 * per-college counts, and shadow data (unassigned students).
 * 
 * Used for verification and debugging of Option 2 architecture.
 */
export async function GET(request: NextRequest) {
  try {
    const result = await getDatabaseMetricsAction();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to fetch metrics" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      metrics: result.metrics,
    });
  } catch (error: any) {
    console.error("[API] /api/students/metrics error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * API Route: POST /api/students/metrics
 * 
 * Same as GET but supports POST for easier fetch() calls from browser console.
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
