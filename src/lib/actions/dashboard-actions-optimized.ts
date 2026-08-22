"use server";

import { prisma } from '@/lib/prisma';


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
  return (async () => {
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

              status: 'active',
            },
          }),
          
          // Recent exams (last 7 days)
          prisma.exams.count({
            where: {

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
    })();
  }

// ============================================================================
// STUDENT DASHBOARD STATS
// ============================================================================

export async function getStudentDashboardStatsAction(studentId: string) {
  return (async () => {
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

          status: 'active',
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
            recentAttempts: recentAttempts.map((a: any) => ({
              ...a,
              // Convert Prisma Decimal to number for client serialization
              percentage: a.percentage !== null && a.percentage !== undefined ? Number(String(a.percentage)) : null,
              // Convert Date objects to ISO strings
              createdAt: a.createdAt ? a.createdAt.toISOString() : null,
            })),
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
    })();
  }

// ============================================================================
// COLLEGE ADMIN DASHBOARD STATS
// ============================================================================

export async function getCollegeAdminDashboardStatsAction(collegeId: string) {
  return (async () => {
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
      // Students in this college ONLY
      prisma.students.count({
        where: {
          OR: [
            { collegeId },
            { colleges: { id: collegeId } },
            { colleges: { name: { equals: collegeId, mode: 'insensitive' } } },
          ],
        },
      }),
      
      // Batches in this college ONLY
      prisma.batches.count({
        where: {
          OR: [
            { collegeId },
            { collegeId: { equals: collegeId, mode: 'insensitive' } },
          ],
        },
      }),
      
      // Exams assigned to this college OR no specific college (treated as global)
      prisma.exams.count({
        where: {
          OR: [
            { collegeId }, // Direct college assignment
            { collegeId: null }, // No college = global
            { collegeId: { in: ['', 'global', 'GLOBAL', 'all', 'ALL'] } }, // Explicit global markers
          ],
          status: 'active',
        },
      }),
      
      // Resources for this college OR no specific college (treated as global)
      prisma.resources.count({
        where: {
          OR: [
            { collegeId }, // Direct college assignment
            { collegeId: null }, // No college = global
            { collegeId: { in: ['', 'global', 'GLOBAL', 'all', 'ALL'] } }, // Explicit global markers
          ],
        },
      }),
      
      // Active students in college ONLY
      prisma.students.count({
        where: {
          users: { status: 'active' },
          OR: [
            { collegeId },
            { colleges: { id: collegeId } },
          ],
        },
      }),
      
      // Recent students (last 7 days) in college ONLY
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
      
      // Recent exams (last 7 days) for this college OR global
      prisma.exams.count({
        where: {
          OR: [
            { collegeId }, // Direct college assignment
            { collegeId: null }, // No college = global
            { collegeId: { in: ['', 'global', 'GLOBAL', 'all', 'ALL'] } }, // Explicit global markers
          ],
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
    })();
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
        where: { },
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
        recentAttempts: recentAttempts.map((a: any) => ({
          ...a,
          // Convert Prisma Decimal to number for client serialization
          percentage: a.percentage !== null && a.percentage !== undefined ? Number(String(a.percentage)) : null,
          // Convert Date objects to ISO strings
          createdAt: a.createdAt ? a.createdAt.toISOString() : null,
        })),
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
// RECENT ACTIVITY FOR COLLEGE ADMIN (FILTERED)
// ============================================================================

export async function getCollegeRecentActivityAction(collegeId: string, limit: number = 10) {
  try {
    const [recentStudents, recentExams, recentAttempts, recentBatches] = await Promise.all([
      // Recent students in THIS college only
      prisma.students.findMany({
        where: {
          OR: [
            { collegeId },
            { colleges: { id: collegeId } },
          ],
        },
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
      
      // Recent exams for THIS college OR global
      prisma.exams.findMany({
        where: {
          OR: [
            { collegeId }, // Direct college assignment
            { collegeId: null }, // No college = global
            { collegeId: { in: ['', 'global', 'GLOBAL', 'all', 'ALL'] } }, // Explicit global markers
          ],
        },
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
      
      // Recent exam attempts from THIS college students only
      prisma.exam_results.findMany({
        where: {
          students: {
            OR: [
              { collegeId },
              { colleges: { id: collegeId } },
            ],
          },
        },
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
      
      // Recent batches in THIS college only
      prisma.batches.findMany({
        where: {
          OR: [
            { collegeId },
            { collegeId: { equals: collegeId, mode: 'insensitive' } },
          ],
        },
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
        recentAttempts: recentAttempts.map((a: any) => ({
          ...a,
          // Convert Prisma Decimal to number for client serialization
          percentage: a.percentage !== null && a.percentage !== undefined ? Number(String(a.percentage)) : null,
          // Convert Date objects to ISO strings
          createdAt: a.createdAt ? a.createdAt.toISOString() : null,
        })),
        recentBatches,
      },
    };
  } catch (error: any) {
    console.error("[COLLEGE_RECENT_ACTIVITY] Error:", error);
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

