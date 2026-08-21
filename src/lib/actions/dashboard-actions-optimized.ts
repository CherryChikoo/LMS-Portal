"use server";

import { prisma } from '@/lib/prisma';
import { getCached } from '@/lib/cache/query-cache';

/**
 * ULTRA-OPTIMIZED DASHBOARD ACTIONS
 * 
 * Only fetches counts and aggregates - never loads full datasets
 * Designed for instant dashboard loading with 50k+ records
 */

// ============================================================================
// ADMIN DASHBOARD STATS
// ============================================================================

export async function getAdminDashboardStatsAction() {
  return getCached(
    'dashboard-stats',
    { role: 'admin' },
    async () => {
      try {
        // Import the new metrics function dynamically to avoid circular deps
        const { getDatabaseMetricsAction } = await import('./student-actions-optimized');
        
        // Get THE MATH (true counts with shadow data)
        const metricsResult = await getDatabaseMetricsAction();
        
        const [
          activeExams,
          recentExams,
          totalAttempts,
          recentAttempts,
        ] = await Promise.all([
          // Active exams - check for status = 'published' and not soft deleted
          prisma.exams.count({
            where: {
              deletedAt: null,
              status: 'published',
            },
          }),
          
          // Recent exams (last 7 days)
          prisma.exams.count({
            where: {
              deletedAt: null,
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          }),
          
          // Total exam attempts
          prisma.exam_results.count(),
          
          // Recent attempts (last 7 days)
          prisma.exam_results.count({
            where: {
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          }),
        ]);

        // Calculate average completion rate
        const completedAttempts = await prisma.exam_results.count({
          where: { status: 'completed' },
        });
        const completionRate = totalAttempts > 0 
          ? Math.round((completedAttempts / totalAttempts) * 100) 
          : 0;

        // Use metrics from THE MATH (true database counts)
        const metrics = metricsResult.success && metricsResult.metrics 
          ? metricsResult.metrics 
          : null;

        // Count recent students from master count (no WHERE clause to hide shadow data)
        const recentStudents = await prisma.students.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        });

        return {
          success: true as const,
          stats: {
            students: {
              total: metrics?.masterStudentCount || 0, // THE MATH: true count with shadow data
              active: metrics?.activeStudents || 0,
              recent: recentStudents,
            },
            colleges: {
              total: metrics?.totalColleges || 0,
            },
            exams: {
              total: metrics?.totalExams || 0,
              active: activeExams,
              recent: recentExams,
            },
            resources: {
              total: await prisma.resources.count(), // Fetch actual count from database
            },
            batches: {
              total: metrics?.totalBatches || 0,
            },
            attempts: {
              total: totalAttempts,
              recent: recentAttempts,
              completed: completedAttempts,
              completionRate,
            },
          },
        };
      } catch (error: any) {
        console.error("[ADMIN_DASHBOARD_STATS] Error:", error);
        return {
          success: false as const,
          error: error.message,
          stats: null,
        };
      }
    }
  );
}

// ============================================================================
// STUDENT DASHBOARD STATS
// ============================================================================

export async function getStudentDashboardStatsAction(studentId: string) {
  return getCached(
    'dashboard-stats',
    { role: 'student', studentId },
    async () => {
      try {
    const [
      assignedExamsCount,
      completedAttemptsCount,
      assignedResourcesCount,
      avgScore,
      recentAttempts,
    ] = await Promise.all([
      // Count assigned exams (simplified - counts all published/active exams)
      prisma.exams.count({
        where: {
          deletedAt: null,
          status: 'published',
        },
      }),
      
      // Count completed attempts for this student
      prisma.exam_results.count({
        where: {
          studentId,
          status: 'completed',
        },
      }),
      
      // Count assigned resources (simplified - counts all resources)
      prisma.resources.count(),
      
      // Calculate average score
      prisma.exam_results.aggregate({
        where: {
          studentId,
          status: 'completed',
        },
        _avg: {
          percentage: true,
        },
      }),
      
      // Get recent 5 attempts for the student
      prisma.exam_results.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          examId: true,
          percentage: true,
          status: true,
          createdAt: true,
          exams: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    ]);

        const averageScore = Math.round(Number(avgScore._avg.percentage || 0));

        return {
          success: true as const,
          stats: {
            assignedExams: assignedExamsCount,
            completedAttempts: completedAttemptsCount,
            assignedResources: assignedResourcesCount,
            averageScore,
            recentAttempts,
          },
        };
      } catch (error: any) {
        console.error("[STUDENT_DASHBOARD_STATS] Error:", error);
        return {
          success: false as const,
          error: error.message,
          stats: null,
        };
      }
    }
  );
}

// ============================================================================
// COLLEGE ADMIN DASHBOARD STATS
// ============================================================================

export async function getCollegeAdminDashboardStatsAction(collegeId: string) {
  return getCached(
    'dashboard-stats',
    { role: 'college_admin', collegeId },
    async () => {
      try {
    const [
      collegeStudentsCount,
      collegeBatchesCount,
      collegeExamsCount,
      collegeResourcesCount,
      activeStudentsCount,
      recentStudentsCount,
      recentExamsCount,
    ] = await Promise.all([
      // Students in this college
      prisma.students.count({
        where: {
          OR: [
            { collegeId },
            { colleges: { id: collegeId } },
            { colleges: { name: { equals: collegeId, mode: 'insensitive' } } },
          ],
        },
      }),
      
      // Batches in this college
      prisma.batches.count({
        where: {
          OR: [
            { collegeId },
            { collegeId: { equals: collegeId, mode: 'insensitive' } },
          ],
        },
      }),
      
      // Exams assigned to this college (simplified)
      prisma.exams.count({
        where: { deletedAt: null },
      }),
      
      // Resources for this college (simplified)
      prisma.resources.count(),
      
      // Active students in college
      prisma.students.count({
        where: {
          users: { status: 'active' },
          OR: [
            { collegeId },
            { colleges: { id: collegeId } },
          ],
        },
      }),
      
      // Recent students (last 7 days)
      prisma.students.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
          OR: [
            { collegeId },
            { colleges: { id: collegeId } },
          ],
        },
      }),
      
      // Recent exams (last 7 days)
      prisma.exams.count({
        where: {
          deletedAt: null,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

        return {
          success: true as const,
          stats: {
            students: {
              total: collegeStudentsCount,
              active: activeStudentsCount,
              recent: recentStudentsCount,
            },
            batches: {
              total: collegeBatchesCount,
            },
            exams: {
              total: collegeExamsCount,
              recent: recentExamsCount,
            },
            resources: {
              total: collegeResourcesCount,
            },
          },
        };
      } catch (error: any) {
        console.error("[COLLEGE_ADMIN_DASHBOARD_STATS] Error:", error);
        return {
          success: false as const,
          error: error.message,
          stats: null,
        };
      }
    }
  );
}

// ============================================================================
// RECENT ACTIVITY (LIMITED)
// ============================================================================

export async function getRecentActivityAction(limit: number = 10) {
  try {
    const [recentStudents, recentExams, recentAttempts, recentBatches] = await Promise.all([
      // Recent students (only essential fields)
      prisma.students.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 20),
        select: {
          id: true,
          createdAt: true,
          users: {
            select: {
              displayName: true,
              email: true,
            },
          },
          colleges: {
            select: {
              name: true,
            },
          },
        },
      }),
      
      // Recent exams (only essential fields)
      prisma.exams.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 20),
        select: {
          id: true,
          title: true,
          createdAt: true,
          startTime: true,
          endTime: true,
        },
      }),
      
      // Recent exam attempts (only essential fields)
      prisma.exam_results.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 20),
        select: {
          id: true,
          studentId: true,
          examId: true,
          percentage: true,
          status: true,
          createdAt: true,
          students: {
            select: {
              users: {
                select: {
                  displayName: true,
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
      }),
      
      // Recent batches (only essential fields)
      prisma.batches.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 20),
        select: {
          id: true,
          name: true,
          department: true,
          academicYear: true,
          createdAt: true,
          colleges: {
            select: {
              name: true,
            },
          },
          _count: {
            select: {
              student_batches: true,
            },
          },
        },
      }),
    ]);

    return {
      success: true as const,
      data: {
        recentStudents,
        recentExams,
        recentAttempts,
        recentBatches,
      },
    };
  } catch (error: any) {
    console.error("[RECENT_ACTIVITY] Error:", error);
    return {
      success: false as const,
      error: error.message,
      data: null,
    };
  }
}

// ============================================================================
// ANALYTICS (AGGREGATED)
// ============================================================================

export async function getDashboardAnalyticsAction() {
  try {
    // Get enrollment trend (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [
      enrollmentTrend,
      examCompletionTrend,
      topPerformers,
    ] = await Promise.all([
      // Daily enrollment counts (last 30 days)
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM students
        WHERE created_at >= ${thirtyDaysAgo}
        AND is_deleted IS NOT TRUE
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `,
      
      // Daily exam completion counts (last 30 days)
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM exam_results
        WHERE created_at >= ${thirtyDaysAgo}
        AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `,
      
      // Top 10 performers (by average score)
      prisma.$queryRaw`
        SELECT 
          s.id,
          u.display_name as name,
          c.name as college,
          AVG(ea.percentage) as avg_score,
          COUNT(ea.id) as total_attempts
        FROM students s
        JOIN users u ON u.id = s.id
        LEFT JOIN colleges c ON c.id = s.college_id
        LEFT JOIN exam_results ea ON ea.student_id = s.id
        WHERE s.is_deleted IS NOT TRUE
        AND ea.status = 'completed'
        GROUP BY s.id, u.display_name, c.name
        HAVING COUNT(ea.id) >= 3
        ORDER BY avg_score DESC
        LIMIT 10
      `,
    ]);

    return {
      success: true as const,
      analytics: {
        enrollmentTrend,
        examCompletionTrend,
        topPerformers,
      },
    };
  } catch (error: any) {
    console.error("[DASHBOARD_ANALYTICS] Error:", error);
    return {
      success: false as const,
      error: error.message,
      analytics: null,
    };
  }
}
