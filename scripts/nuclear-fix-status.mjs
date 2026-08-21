import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function nuclearFixStatus() {
  console.log('🔥 NUCLEAR FIX: Setting ALL students to ACTIVE in BOTH tables\n');

  try {
    // Get all students
    const allStudents = await prisma.students.findMany({
      select: {
        id: true,
        collegeId: true,
        department: true,
        users: {
          select: {
            displayName: true,
            email: true,
          }
        }
      }
    });

    console.log(`📊 Found ${allStudents.length} students\n`);

    // Update ALL students to active in users table ONLY
    console.log('⚡ Updating ALL students to ACTIVE in users table...\n');
    
    let updated = 0;
    for (const student of allStudents) {
      await prisma.users.update({
        where: { id: student.id },
        data: { 
          status: 'active',
          updatedAt: new Date()
        }
      });
      updated++;
      if (updated % 100 === 0) {
        console.log(`   Updated ${updated}/${allStudents.length}...`);
      }
    }

    console.log(`\n✅ Updated ${updated} students to ACTIVE in users table\n`);

    // Verify - check if any restricted users remain
    const restrictedUsers = await prisma.users.findMany({
      where: { status: 'restricted', role: 'student' },
      select: { id: true, email: true, displayName: true }
    });

    console.log('📋 VERIFICATION:');
    console.log(`   Restricted in users table: ${restrictedUsers.length}`);

    if (restrictedUsers.length === 0) {
      console.log('\n✅✅✅ SUCCESS! All students are now ACTIVE!\n');
    } else {
      console.log('\n⚠️  Some restricted users remain in users table:');
      restrictedUsers.forEach(u => console.log(`     - ${u.displayName || u.email} (${u.id})`));
    }

    console.log('\n🧹 NOW YOU MUST:');
    console.log('   1. Clear browser cache: localStorage.clear(); sessionStorage.clear(); location.reload();');
    console.log('   2. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)');
    console.log('   3. Check the UI - ALL students should show "Active"\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

nuclearFixStatus();
