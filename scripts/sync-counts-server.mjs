/**
 * Server-side script to sync college student counts
 * 
 * Usage: node scripts/sync-counts-server.mjs
 * 
 * This script directly updates the database without requiring authentication
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

// Setup Prisma with pg adapter
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: 10,
  min: 2,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function syncCollegeCounts() {
  console.log('🔄 Starting college count sync...\n');
  
  try {
    // Get all colleges
    const colleges = await prisma.colleges.findMany({
      select: { id: true, name: true, studentCount: true }
    });

    console.log(`📊 Found ${colleges.length} colleges\n`);

    const updates = [];
    let totalUpdated = 0;

    // For each college, count actual students and update
    for (const college of colleges) {
      // Count students in this college
      const actualCount = await prisma.students.count({
        where: { collegeId: college.id }
      });

      const oldCount = college.studentCount || 0;

      // Only update if counts differ
      if (actualCount !== oldCount) {
        await prisma.colleges.update({
          where: { id: college.id },
          data: { studentCount: actualCount }
        });

        updates.push({
          college: college.name,
          oldCount,
          newCount: actualCount,
          difference: actualCount - oldCount
        });

        totalUpdated++;
        console.log(`✅ Updated "${college.name}": ${oldCount} → ${actualCount}`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Sync completed successfully!`);
    console.log(`📊 Total colleges: ${colleges.length}`);
    console.log(`🔄 Updated colleges: ${totalUpdated}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (updates.length > 0) {
      console.log('📋 Summary of changes:');
      console.table(updates);
    } else {
      console.log('✨ All counts were already correct!\n');
    }

  } catch (error) {
    console.error('❌ Error during sync:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

syncCollegeCounts();
