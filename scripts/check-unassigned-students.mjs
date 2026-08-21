/**
 * Check for students without college assignment
 * 
 * Usage: node scripts/check-unassigned-students.mjs
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkUnassignedStudents() {
  console.log('🔍 Checking for unassigned/global students...\n');
  
  try {
    // Count students with NULL collegeId
    const unassignedCount = await prisma.students.count({
      where: { collegeId: null }
    });
    
    // Get total student count
    const totalStudents = await prisma.students.count();
    
    // Get assigned students count
    const assignedCount = totalStudents - unassignedCount;
    
    console.log('📊 Student Distribution:');
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   Assigned to Colleges: ${assignedCount}`);
    console.log(`   Unassigned (Global): ${unassignedCount}\n`);
    
    if (unassignedCount > 0) {
      console.log('📋 Unassigned Students:');
      const unassignedStudents = await prisma.students.findMany({
        where: { collegeId: null },
        select: {
          id: true,
          users: {
            select: {
              displayName: true,
              email: true
            }
          },
          department: true,
          academicYear: true
        },
        take: 10 // Show first 10
      });
      
      console.table(unassignedStudents.map(s => ({
        name: s.users?.displayName || 'Unknown',
        email: s.users?.email || 'Unknown',
        department: s.department || 'N/A',
        year: s.academicYear || 'N/A'
      })));
      
      if (unassignedCount > 10) {
        console.log(`   ... and ${unassignedCount - 10} more\n`);
      }
    } else {
      console.log('✅ All students are assigned to colleges!\n');
    }
    
    // Verify college counts don't include unassigned students
    console.log('🔍 Verifying college counts exclude unassigned students...');
    const colleges = await prisma.colleges.findMany({
      select: { id: true, name: true, studentCount: true }
    });
    
    let totalCollegeCounts = 0;
    for (const college of colleges) {
      totalCollegeCounts += college.studentCount || 0;
    }
    
    console.log(`   Sum of all college counts: ${totalCollegeCounts}`);
    console.log(`   Actual assigned students: ${assignedCount}`);
    
    if (totalCollegeCounts === assignedCount) {
      console.log('   ✅ College counts are correct!\n');
    } else {
      console.log(`   ⚠️  Mismatch! Difference: ${Math.abs(totalCollegeCounts - assignedCount)}`);
      console.log('   Run: node scripts/sync-counts-server.mjs to fix\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkUnassignedStudents();
