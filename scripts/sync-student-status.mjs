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

async function syncStudentStatus() {
  console.log('🔄 Starting status sync for all students...\n');

  try {
    // Get all students with their user info
    const allStudents = await prisma.students.findMany({
      include: {
        users: {
          select: {
            id: true,
            status: true,
            displayName: true,
            email: true,
          }
        }
      }
    });

    console.log(`📊 Found ${allStudents.length} student records\n`);

    let syncedCount = 0;
    let alreadyActiveCount = 0;
    let fixedCount = 0;

    for (const student of allStudents) {
      const userStatus = student.users?.status || 'active';
      const studentName = student.users?.displayName || student.users?.email || student.id;

      // Check if already active
      if (userStatus === 'active') {
        alreadyActiveCount++;
        console.log(`✅ ${studentName}: Already active`);
      } else {
        console.log(`⚠️  ${studentName}: Status is ${userStatus}, setting to active...`);
        
        // Set BOTH users.status AND students.status to 'active' to ensure consistency
        await prisma.$transaction([
          prisma.users.update({
            where: { id: student.id },
            data: { status: 'active' }
          }),
          prisma.students.update({
            where: { id: student.id },
            data: { status: 'active' }
          })
        ]);

        fixedCount++;
        console.log(`   ✅ Fixed: Both users and students tables set to 'active'`);
      }

      syncedCount++;
    }

    // Also check for any users with student role that don't have student records
    const usersWithoutStudents = await prisma.users.findMany({
      where: {
        role: 'student',
        students: null
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true
      }
    });

    if (usersWithoutStudents.length > 0) {
      console.log(`\n⚠️  Found ${usersWithoutStudents.length} users with student role but no student record:`);
      for (const user of usersWithoutStudents) {
        console.log(`   - ${user.displayName || user.email} (${user.id})`);
        // Set to active
        await prisma.users.update({
          where: { id: user.id },
          data: { status: 'active' }
        });
        console.log(`   ✅ Set to 'active'`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SYNC SUMMARY:');
    console.log('='.repeat(60));
    console.log(`✅ Total students processed: ${syncedCount}`);
    console.log(`✅ Already active: ${alreadyActiveCount}`);
    console.log(`🔧 Fixed (set to active): ${fixedCount}`);
    console.log(`📝 Users without student records: ${usersWithoutStudents.length}`);
    console.log('='.repeat(60));
    console.log('\n✅ All student accounts are now ACTIVE!\n');

  } catch (error) {
    console.error('❌ Error syncing status:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

syncStudentStatus();
