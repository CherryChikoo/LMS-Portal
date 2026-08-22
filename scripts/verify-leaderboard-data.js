/**
 * Verification script for leaderboard data flow
 * Run this to check if exam results are properly fetched
 * 
 * Usage: node scripts/verify-leaderboard-data.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyLeaderboardData() {
  console.log('🔍 Verifying Leaderboard Data Flow...\n');

  try {
    // 1. Check exam_results table
    const resultsCount = await prisma.exam_results.count();
    console.log(`✓ Total exam results in database: ${resultsCount}`);

    if (resultsCount === 0) {
      console.log('⚠️  No exam results found. Leaderboard will be empty.');
      console.log('   Run seed script or have students complete exams first.\n');
      return;
    }

    // 2. Check recent results
    const recentResults = await prisma.exam_results.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        studentId: true,
        examId: true,
        score: true,
        totalMarks: true,
        percentage: true,
        createdAt: true,
        students: {
          select: {
            users: {
              select: {
                displayName: true,
                email: true,
              },
            },
          },
        },
        exams: {
          select: {
            title: true,
          },
        },
      },
    });

    console.log(`\n📊 Recent Exam Results (Latest 5):`);
    recentResults.forEach((result, index) => {
      const studentName = result.students?.users?.displayName || 'Unknown Student';
      const examTitle = result.exams?.title || 'Unknown Exam';
      const score = result.score || 0;
      const totalMarks = result.totalMarks || 0;
      const percentage = result.percentage || 0;

      console.log(`   ${index + 1}. ${studentName}`);
      console.log(`      Exam: ${examTitle}`);
      console.log(`      Score: ${score}/${totalMarks} (${percentage}%)`);
      console.log(`      Date: ${result.createdAt?.toLocaleString()}\n`);
    });

    // 3. Check students with attempts
    const studentsWithAttempts = await prisma.students.findMany({
      where: {
        exam_results: {
          some: {},
        },
      },
      select: {
        id: true,
        users: {
          select: {
            displayName: true,
          },
        },
        _count: {
          select: {
            exam_results: true,
          },
        },
      },
      take: 10,
      orderBy: {
        exam_results: {
          _count: 'desc',
        },
      },
    });

    console.log(`✓ Students with exam attempts: ${studentsWithAttempts.length}`);
    console.log(`\n🏆 Top Students by Attempt Count:`);
    studentsWithAttempts.forEach((student, index) => {
      const name = student.users?.displayName || 'Unknown';
      const attempts = student._count.exam_results;
      console.log(`   ${index + 1}. ${name} - ${attempts} attempt(s)`);
    });

    // 4. Aggregate stats
    const stats = await prisma.exam_results.aggregate({
      _avg: {
        score: true,
        percentage: true,
      },
      _max: {
        score: true,
      },
      _min: {
        score: true,
      },
    });

    console.log(`\n📈 Overall Statistics:`);
    console.log(`   Average Score: ${stats._avg.score?.toFixed(2) || 0}`);
    console.log(`   Average Percentage: ${stats._avg.percentage?.toFixed(2) || 0}%`);
    console.log(`   Highest Score: ${stats._max.score || 0}`);
    console.log(`   Lowest Score: ${stats._min.score || 0}`);

    console.log('\n✅ Leaderboard data verification complete!');
    console.log('   The leaderboard should now display live data.\n');

  } catch (error) {
    console.error('❌ Error verifying leaderboard data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyLeaderboardData();
