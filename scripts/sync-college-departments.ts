/**
 * Sync College Departments Script
 * 
 * This script updates each college's departments array to include
 * all unique departments that students are actually enrolled in.
 */

import { prisma } from '../src/lib/prisma';

async function syncCollegeDepartments() {
  console.log('🔄 Starting college departments sync...\n');

  try {
    // Get all colleges
    const colleges = await prisma.colleges.findMany({
      where: { NOT: { isDeleted: true } },
      select: { id: true, name: true, departments: true }
    });

    console.log(`Found ${colleges.length} colleges to process\n`);

    for (const college of colleges) {
      console.log(`\n📚 Processing: ${college.name} (${college.id})`);
      console.log(`   Current departments: ${JSON.stringify(college.departments)}`);

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

      console.log(`   Student departments found: ${JSON.stringify(studentDepartments)}`);
      console.log(`   Updated departments: ${JSON.stringify(allDepartments)}`);

      // Update the college
      await prisma.colleges.update({
        where: { id: college.id },
        data: { 
          departments: allDepartments,
          updatedAt: new Date()
        }
      });

      console.log(`   ✅ Updated ${college.name} with ${allDepartments.length} departments`);
    }

    console.log('\n\n✨ Sync completed successfully!');
  } catch (error) {
    console.error('❌ Error syncing departments:', error);
    throw error;
  }
}

syncCollegeDepartments();
