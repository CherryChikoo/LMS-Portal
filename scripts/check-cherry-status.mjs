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

async function checkCherryStatus() {
  console.log('🔍 Checking Cherry\'s account status...\n');

  try {
    // Find user with displayName "Cherry"
    const cherryUsers = await prisma.users.findMany({
      where: {
        OR: [
          { email: 'molugulaishricharan@gmail.com' },
          { displayName: { contains: 'Cherry', mode: 'insensitive' } },
          { displayName: { contains: 'Charan', mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        students: {
          select: {
            id: true,
            collegeId: true,
            department: true,
          }
        }
      }
    });

    if (cherryUsers.length === 0) {
      console.log('❌ No users found with "cherry" in email');
    } else {
      console.log(`✅ Found ${cherryUsers.length} user(s):\n`);
      cherryUsers.forEach((user, idx) => {
        console.log(`${idx + 1}. ${user.displayName || 'No name'}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Status: ${user.status}`);
        console.log(`   ID: ${user.id}`);
        if (user.students) {
          console.log(`   Student Record: College ${user.students.collegeId}, Dept: ${user.students.department || 'N/A'}`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkCherryStatus();
