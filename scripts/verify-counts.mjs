/**
 * Verification script to check college student counts
 * 
 * Usage: node scripts/verify-counts.mjs
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

async function verifyCollegeCounts() {
  console.log('🔍 Verifying college student counts...\n');
  
  try {
    const colleges = await prisma.colleges.findMany({
      select: { id: true, name: true, studentCount: true },
      orderBy: { name: 'asc' }
    });

    console.log('📊 College Student Counts:\n');
    
    const results = [];
    for (const college of colleges) {
      // Count actual students
      const actualCount = await prisma.students.count({
        where: { collegeId: college.id }
      });
      
      const storedCount = college.studentCount || 0;
      const isCorrect = actualCount === storedCount;
      
      results.push({
        college: college.name,
        stored: storedCount,
        actual: actualCount,
        status: isCorrect ? '✅' : '❌'
      });
      
      const icon = isCorrect ? '✅' : '❌';
      console.log(`${icon} ${college.name}`);
      console.log(`   Stored: ${storedCount} | Actual: ${actualCount}`);
      if (!isCorrect) {
        console.log(`   ⚠️  MISMATCH! Difference: ${actualCount - storedCount}`);
      }
      console.log('');
    }
    
    const allCorrect = results.every(r => r.status === '✅');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (allCorrect) {
      console.log('✅ All college counts are correct!');
    } else {
      console.log('❌ Some colleges have mismatched counts');
      console.log('   Run: node scripts/sync-counts-server.mjs to fix');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.table(results);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

verifyCollegeCounts();
