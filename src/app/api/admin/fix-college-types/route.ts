import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Emergency fix: Reset colleges that were wrongly marked as "external"
 * This should be run once to fix the bug where ensureCollegeDocument
 * was converting official colleges to external type
 */
export async function POST(request: NextRequest) {
  try {
    // Get all colleges marked as external
    const externalColleges = await prisma.colleges.findMany({
      where: { 
        type: "external",
        NOT: { isDeleted: true }
      }
    });

    console.log(`Found ${externalColleges.length} colleges marked as external`);

    // Reset them to null/official if they have proper IDs (not ext-xxx format)
    const fixed = [];
    for (const college of externalColleges) {
      // If the ID doesn't start with "ext-", it's an official college
      if (!college.id.startsWith("ext-")) {
        await prisma.colleges.update({
          where: { id: college.id },
          data: { 
            type: null, // Reset to default (official)
            updatedAt: new Date()
          }
        });
        fixed.push(college.name);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed.length} colleges`,
      colleges: fixed
    });

  } catch (error) {
    console.error("Error fixing college types:", error);
    return NextResponse.json(
      { error: "Failed to fix college types" },
      { status: 500 }
    );
  }
}
