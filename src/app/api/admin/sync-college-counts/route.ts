import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * API endpoint to recalculate and sync all college student counts
 * 
 * This fixes any inconsistencies in the studentCount column by:
 * 1. Counting actual students in each college from the students table
 * 2. Updating the colleges table with accurate counts
 * 
 * Usage: POST /api/admin/sync-college-counts
 * Requires: Admin authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization token." },
        { status: 401 }
      );
    }

    const adminIdToken = authHeader.split("Bearer ")[1];
    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);

    if (verifyError || !adminUser) {
      return NextResponse.json(
        { error: "Invalid or expired admin session." },
        { status: 401 }
      );
    }

    // Verify admin role
    const requesterDoc = await prisma.users.findFirst({
      where: {
        OR: [
          { id: adminUser.id },
          { authId: adminUser.id }
        ]
      },
      select: { role: true }
    });

    const requesterRole = requesterDoc?.role;
    if (!requesterRole || !["admin", "main_admin", "superadmin"].includes(requesterRole)) {
      return NextResponse.json(
        { error: "Insufficient permissions. Only admins can sync college counts." },
        { status: 403 }
      );
    }

    // Get all colleges
    const colleges = await prisma.colleges.findMany({
      select: { id: true, name: true, studentCount: true }
    });

    const updates: Array<{ collegeId: string; collegeName: string; oldCount: number; newCount: number }> = [];
    let totalUpdated = 0;

    // For each college, count actual students and update
    for (const college of colleges) {
      // Count students in this college
      const actualCount = await prisma.students.count({
        where: { collegeId: college.id }
      });

      const oldCount = college.studentCount || 0;

      // Only update if counts differ
      if (actualCount !== oldCount) {
        await prisma.colleges.update({
          where: { id: college.id },
          data: { studentCount: actualCount }
        });

        updates.push({
          collegeId: college.id,
          collegeName: college.name,
          oldCount,
          newCount: actualCount
        });

        totalUpdated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${totalUpdated} college student counts.`,
      totalColleges: colleges.length,
      updatedColleges: totalUpdated,
      updates: updates.length > 0 ? updates : undefined
    });

  } catch (err: any) {
    console.error("Error syncing college counts:", err);
    return NextResponse.json(
      {
        error: "Internal server error while syncing college counts.",
        details: err.message || String(err)
      },
      { status: 500 }
    );
  }
}
