import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting college departments sync...');

    // Get all colleges
    const colleges = await prisma.colleges.findMany({
      where: { NOT: { isDeleted: true } },
      select: { id: true, name: true, departments: true }
    });

    console.log(`Found ${colleges.length} colleges to process`);

    const results: Record<string, { old: string[]; new: string[]; studentDepts: string[] }> = {};

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

      results[college.name] = {
        old: college.departments || [],
        new: allDepartments,
        studentDepts: studentDepartments
      };

      // Update the college
      await prisma.colleges.update({
        where: { id: college.id },
        data: { 
          departments: allDepartments,
          updatedAt: new Date()
        }
      });

      console.log(`✅ ${college.name}: ${college.departments?.length || 0} → ${allDepartments.length} departments`);
    }

    console.log('✨ Sync completed successfully!');
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced ${colleges.length} colleges`,
      results 
    });
  } catch (error) {
    console.error('❌ Error syncing departments:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
