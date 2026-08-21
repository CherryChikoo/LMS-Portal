import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function debugCherryStatus() {
  console.log('🔍 Debug: Checking Cherry account from college col011...\n');

  try {
    // Get all students from col011 (Cherry's college according to screenshot)
    const col011Students = await prisma.students.findMany({
      where: {
        collegeId: 'col011'
      },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            status: true,
          }
        },
        colleges: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5 // Just first 5 to see the pattern
    });

    console.log(`Found ${col011Students.length} students in col011\n`);

    col011Students.forEach((student, idx) => {
      const userName = student.users?.displayName || 'No name';
      const userEmail = student.users?.email || 'No email';
      const userStatus = student.users?.status || 'NO STATUS IN USERS TABLE';
      
      console.log(`${idx + 1}. ${userName}`);
      console.log(`   Email: ${userEmail}`);
      console.log(`   User ID: ${student.id}`);
      console.log(`   users.status: ${userStatus}`);
      console.log(`   College: ${student.colleges?.name || student.collegeId}`);
      console.log(`   Department: ${student.department || 'N/A'}`);
      
      // Check if students table has fields that might be confused with status
      console.log(`   Student record keys:`, Object.keys(student).filter(k => !['users', 'colleges', 'student_batches'].includes(k)));
      console.log('');
    });

    // Also specifically search for Cherry by email
    console.log('\n🔍 Searching specifically for molugulaishricharan@gmail.com...\n');
    const cherryUser = await prisma.users.findFirst({
      where: {
        email: 'molugulaishricharan@gmail.com'
      },
      include: {
        students: {
          select: {
            id: true,
            collegeId: true,
            department: true,
            academicYear: true,
          }
        }
      }
    });

    if (cherryUser) {
      console.log(`✅ Found Cherry!`);
      console.log(`   Name: ${cherryUser.displayName}`);
      console.log(`   Email: ${cherryUser.email}`);
      console.log(`   Role: ${cherryUser.role}`);
      console.log(`   Status in users table: ${cherryUser.status}`);
      console.log(`   Has student record: ${cherryUser.students ? 'Yes' : 'No'}`);
      if (cherryUser.students) {
        console.log(`   Student College: ${cherryUser.students.collegeId}`);
        console.log(`   Student Dept: ${cherryUser.students.department}`);
      }
    } else {
      console.log(`❌ No user found with email molugulaishricharan@gmail.com`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

debugCherryStatus();
