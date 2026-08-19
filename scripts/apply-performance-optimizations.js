/**
 * Performance Optimization Script
 * Applies database indexes for 50k+ student support
 * 
 * Run with: node scripts/apply-performance-optimizations.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🚀 Starting performance optimization...\n');

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../prisma/migrations/20260816000000_add_performance_indexes/migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📊 Applying performance indexes...');
    console.log('   This may take 2-5 minutes for large datasets\n');

    // Split by statement and execute
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      if (!statement) continue;

      // Extract index name for logging
      const indexMatch = statement.match(/CREATE INDEX.*?"([^"]+)"/);
      const indexName = indexMatch ? indexMatch[1] : 'unknown';

      try {
        await pool.query(statement);
        console.log(`   ✅ Created index: ${indexName}`);
        successCount++;
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   ⏭️  Skipped (exists): ${indexName}`);
          skipCount++;
        } else {
          console.error(`   ❌ Failed: ${indexName} - ${err.message}`);
          errorCount++;
        }
      }
    }

    console.log('\n📈 Index Summary:');
    console.log(`   ✅ Created: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);

    // Run ANALYZE to update query planner statistics
    console.log('\n📊 Analyzing tables for query optimization...');
    const tables = [
      'users',
      'students',
      'colleges',
      'batches',
      'student_batches',
      'exams',
      'exam_results',
      'resources',
      'trainer_notes'
    ];

    for (const table of tables) {
      try {
        await pool.query(`ANALYZE ${table}`);
        console.log(`   ✅ Analyzed: ${table}`);
      } catch (err) {
        console.error(`   ⚠️  Could not analyze ${table}: ${err.message}`);
      }
    }

    // Get database statistics
    console.log('\n📊 Database Statistics:');
    
    const stats = await pool.query(`
      SELECT
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_rows
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      AND tablename IN ('users', 'students', 'colleges', 'batches', 'exams', 'resources')
      ORDER BY n_live_tup DESC
    `);

    console.log('\n   Table Statistics:');
    stats.rows.forEach(row => {
      console.log(`   ${row.tablename}: ${row.live_rows.toLocaleString()} rows`);
    });

    // Check index usage
    const indexStats = await pool.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as scans
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('users', 'students', 'colleges', 'batches')
      ORDER BY idx_scan DESC
      LIMIT 10
    `);

    console.log('\n   Top 10 Most Used Indexes:');
    if (indexStats.rows.length === 0) {
      console.log('   (No index usage stats yet - run queries first)');
    } else {
      indexStats.rows.forEach(row => {
        console.log(`   ${row.indexname}: ${row.scans.toLocaleString()} scans`);
      });
    }

    console.log('\n✅ Performance optimization complete!');
    console.log('\n📝 Recommendations:');
    console.log('   1. Restart your application to pick up connection pool changes');
    console.log('   2. Monitor query performance in production');
    console.log('   3. Run ANALYZE periodically on large tables');
    console.log('   4. Consider adding more indexes if specific queries are slow\n');

  } catch (err) {
    console.error('\n❌ Fatal error during optimization:');
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
