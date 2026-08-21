"use server";

import { prisma } from '@/lib/prisma';

/**
 * Sync college departments with actual student departments
 * This updates each college's departments array to include all unique
 * departments that students are enrolled in.
 */
export async function syncCollegeDepartmentsAction() {
  try {
    console.log('🔄 Starting college departments sync...');

    // Get all colleges
    const colleges = await prisma.colleges.findMany({
      where: { NOT: { isDeleted: true } },
      select: { id: true, name: true, departments: true }
    });

    console.log(`Found ${colleges.length} colleges to process`);

    const results: Record<string, { old: string[]; new: string[]; count: number }> = {};

    for (const college of colleges) {
      // Get all unique departments from students in this college
      const students = await prisma.students.findMany({
        where: { 
          collegeId: college.id,
          department: { not: null }
        },
        select: { department: true },
        distinct: ['department']
      });

      const studentDepartments = students
        .map(s => s.department)
        .filter(Boolean) as string[];

      // Merge with existing departments
      const allDepartments = Array.from(
        new Set([...studentDepartments, ...(college.departments || [])])
      );

      // Ensure "General" is always included
      if (!allDepartments.includes('General')) {
        allDepartments.push('General');
      }

      // Sort departments for consistency
      allDepartments.sort();

      results[college.id] = {
        old: college.departments || [],
        new: allDepartments,
        count: studentDepartments.length
      };

      // Update the college
      await prisma.colleges.update({
        where: { id: college.id },
        data: { 
          departments: allDepartments,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Updated ${college.name}: ${college.departments?.length || 0} → ${allDepartments.length} departments`);
    }

    console.log('✨ Sync completed successfully!');
    return { success: true, results };
  } catch (error) {
    console.error('❌ Error syncing departments:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
