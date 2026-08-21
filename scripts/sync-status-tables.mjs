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

async function syncStatusTables() {
  console.log('🔄 Syncing status between users and students tables...\n');

  try {
    // Get all students with their user status
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

    let matchCount = 0;
    let mismatchCount = 0;
    let fixedCount = 0;

    for (const student of allStudents) {
      const userStatus = student.users?.status || 'active';
      const studentStatus = student.status || 'active';
      const studentName = student.users?.displayName || student.users?.email || student.id;

      // Check if statuses match
      if (userStatus === studentStatus) {
        matchCount++;
      } else {
        mismatchCount++;
        console.log(`⚠️  MISMATCH: ${studentName}`);
        console.log(`   users.status = ${userStatus}`);
        console.log(`   students.status = ${studentStatus}`);
        console.log(`   → Syncing students.status to match users.status...`);
        
        // Update students.status to match users.status (users table is source of truth)
        await prisma.students.update({
          where: { id: student.id },
          data: { status: userStatus }
        });

        fixedCount++;
        console.log(`   ✅ Fixed: students.status updated to '${userStatus}'\n`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SYNC SUMMARY:');
    console.log('='.repeat(60));
    console.log(`✅ Total students processed: ${allStudents.length}`);
    console.log(`✅ Matching status: ${matchCount}`);
    console.log(`⚠️  Mismatched status: ${mismatchCount}`);
    console.log(`🔧 Fixed: ${fixedCount}`);
    console.log('='.repeat(60));
    console.log('\n✅ Status sync complete! users.status and students.status are now consistent.\n');

  } catch (error) {
    console.error('❌ Error syncing status:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

syncStatusTables();
