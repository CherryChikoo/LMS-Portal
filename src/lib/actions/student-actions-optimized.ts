"use server";

import { prisma } from '@/lib/prisma';
import { getCached, invalidateCache } from '@/lib/cache/query-cache';

/**
 * ULTRA-OPTIMIZED STUDENT ACTIONS FOR 50K+ RECORDS
 * 
 * Key strategies:
 * 1. Cursor-based pagination (faster than offset for large datasets)
 * 2. Server-side filtering (no client-side processing)
 * 3. Selective field loading (only what's needed)
 * 4. Count queries separated from data queries
 * 5. Maximum 1000 records per request
 */

// ============================================================================
// TYPES
// ============================================================================

export type StudentFilters = {
  search?: string;
  collegeId?: string;
  department?: string;
  academicYear?: string;
  section?: string;
  batchId?: string;
  status?: string;
  timeFilter?: "ALL" | "RECENT_24H" | "RECENT_7D" | "CSV" | "MANUAL" | "SELF";
};

export type PaginationParams = {
  cursor?: string; // Student ID to start from
  limit?: number; // Max 1000
};

export type StudentListResponse = {
  students: any[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
};

// ============================================================================
// OPTIMIZED QUERIES
// ============================================================================

/**
 * Build WHERE clause from filters - used by both count and data queries
 */
function buildStudentWhereClause(filters: StudentFilters) {
  const where: any = {};

  // Search across name, email, department
  if (filters.search && filters.search.trim()) {
    const searchTerm = filters.search.trim().toLowerCase();
    where.OR = [
      { users: { displayName: { contains: searchTerm, mode: 'insensitive' } } },
      { users: { email: { contains: searchTerm, mode: 'insensitive' } } },
      { department: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  // College filter
  if (filters.collegeId && filters.collegeId !== "ALL") {
    where.OR = [
      { collegeId: filters.collegeId },
      { colleges: { id: filters.collegeId } },
      { colleges: { name: { equals: filters.collegeId, mode: 'insensitive' } } },
    ];
  }

  // Department filter
  if (filters.department && filters.department !== "ALL") {
    where.department = { equals: filters.department, mode: 'insensitive' };
  }

  // Academic year filter
  if (filters.academicYear && filters.academicYear !== "ALL") {
    where.academicYear = { equals: filters.academicYear, mode: 'insensitive' };
  }

  // Section filter
  if (filters.section && filters.section !== "ALL") {
    where.section = { equals: filters.section, mode: 'insensitive' };
  }

  // Batch filter
  if (filters.batchId && filters.batchId !== "ALL") {
    where.student_batches = {
      some: {
        OR: [
          { batchId: filters.batchId },
          { batches: { name: { equals: filters.batchId, mode: 'insensitive' } } },
        ],
      },
    };
  }

  // Status filter
  if (filters.status && filters.status !== "ALL") {
    where.users = {
      ...where.users,
      status: filters.status,
    };
  }

  // Time filter
  if (filters.timeFilter && filters.timeFilter !== "ALL") {
    const now = new Date();
    if (filters.timeFilter === "RECENT_24H") {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      where.createdAt = { gte: oneDayAgo };
    } else if (filters.timeFilter === "RECENT_7D") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      where.createdAt = { gte: sevenDaysAgo };
    } else if (filters.timeFilter === "CSV") {
      where.enrollmentType = "csv";
    } else if (filters.timeFilter === "MANUAL") {
      where.OR = [
        { enrollmentType: "manual" },
        { enrollmentType: null },
      ];
    } else if (filters.timeFilter === "SELF") {
      where.enrollmentType = "self";
    }
  }

  return where;
}

/**
 * Get filtered student count (FAST - only counts, no data)
 * CACHED: 1 minute TTL, 30s stale time
 */
export async function getStudentCountWithFiltersAction(filters: StudentFilters = {}) {
  return getCached(
    'student-count',
    filters,
    async () => {
      const where = buildStudentWhereClause(filters);
      
      try {
        const count = await prisma.students.count({ where });
        return { success: true as const, count };
      } catch (error: any) {
        console.error("[STUDENT_COUNT] Error:", error);
        return { success: false as const, error: error.message, count: 0 };
      }
    }
  );
}

/**
 * Get paginated students with server-side filtering
 * Uses cursor-based pagination for optimal performance with large datasets
 * CACHED: 2 minute TTL, 1 minute stale time
 */
export async function getStudentsPaginatedAction(
  filters: StudentFilters = {},
  pagination: PaginationParams = {}
): Promise<StudentListResponse> {
  return getCached(
    'students-list',
    { ...filters, cursor: pagination.cursor, limit: pagination.limit },
    async () => {
      const limit = Math.min(pagination.limit || 100, 1000); // Max 1000 per request
      const where = buildStudentWhereClause(filters);

      try {
    // Fetch one extra to determine if there are more results
    const students = await prisma.students.findMany({
      where,
      take: limit + 1,
      skip: pagination.cursor ? 1 : 0, // Skip the cursor
      cursor: pagination.cursor ? { id: pagination.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        authId: true,
        collegeId: true,
        department: true,
        academicYear: true,
        section: true,
        enrollmentType: true,
        rollNumber: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        users: {
          select: {
            id: true,
            displayName: true,
            email: true,
            role: true,
            status: true,
          },
        },
        colleges: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        student_batches: {
          select: {
            batchId: true,
            batches: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const hasMore = students.length > limit;
    const resultsToReturn = hasMore ? students.slice(0, limit) : students;
    const nextCursor = hasMore ? resultsToReturn[resultsToReturn.length - 1].id : null;

    // Get total count in parallel (cached for 30s)
    const countResult = await getStudentCountWithFiltersAction(filters);

        return {
          students: resultsToReturn,
          nextCursor,
          hasMore,
          total: countResult.count,
        };
      } catch (error: any) {
        console.error("[STUDENTS_PAGINATED] Error:", error);
        return {
          students: [],
          nextCursor: null,
          hasMore: false,
          total: 0,
        };
      }
    }
  );
}

/**
 * Get infinite scroll students - optimized for virtual scrolling
 * Returns chunks of 100 students at a time
 * CACHED: 2 minute TTL, 1 minute stale time
 */
export async function getStudentsInfiniteAction(
  filters: StudentFilters = {},
  page: number = 0
) {
  return getCached(
    'students-list',
    { ...filters, page },
    async () => {
      const limit = 100; // Fixed size for virtual scrolling
      const skip = page * limit;

      const where = buildStudentWhereClause(filters);

      try {
    const [students, total] = await Promise.all([
      prisma.students.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          authId: true,
          collegeId: true,
          department: true,
          academicYear: true,
          section: true,
          enrollmentType: true,
          rollNumber: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          users: {
            select: {
              id: true,
              displayName: true,
              email: true,
              role: true,
              status: true,
            },
          },
          colleges: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          student_batches: {
            select: {
              batchId: true,
              batches: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.students.count({ where }),
    ]);

        return {
          success: true as const,
          data: {
            students,
            total,
            page,
            hasMore: (skip + students.length) < total,
          },
        };
      } catch (error: any) {
        console.error("[STUDENTS_INFINITE] Error:", error);
        return {
          success: false as const,
          error: error.message,
          data: null,
        };
      }
    }
  );
}

/**
 * Get student by ID - single record fetch
 */
export async function getStudentByIdOptimizedAction(studentId: string) {
  try {
    const student = await prisma.students.findUnique({
      where: { id: studentId },
      include: {
        users: {
          select: {
            id: true,
            displayName: true,
            email: true,
            role: true,
            status: true,
          },
        },
        colleges: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        student_batches: {
          include: {
            batches: {
              select: {
                id: true,
                name: true,
                department: true,
                section: true,
              },
            },
          },
        },
      },
    });

    return { success: true as const, student };
  } catch (error: any) {
    console.error("[STUDENT_BY_ID] Error:", error);
    return { success: false as const, error: error.message, student: null };
  }
}

/**
 * Get students by college (with limit)
 */
export async function getStudentsByCollegeOptimizedAction(
  collegeId: string,
  limit: number = 1000
) {
  try {
    const students = await prisma.students.findMany({
      where: {
        OR: [
          { collegeId },
          { colleges: { id: collegeId } },
          { colleges: { name: { equals: collegeId, mode: 'insensitive' } } },
        ],
      },
      take: Math.min(limit, 1000),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        authId: true,
        collegeId: true,
        department: true,
        academicYear: true,
        section: true,
        createdAt: true,
        users: {
          select: {
            id: true,
            displayName: true,
            email: true,
            status: true,
          },
        },
        colleges: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { success: true as const, students };
  } catch (error: any) {
    console.error("[STUDENTS_BY_COLLEGE] Error:", error);
    return { success: false as const, error: error.message, students: [] };
  }
}

/**
 * Get dashboard stats (counts only - SUPER FAST)
 */
export async function getStudentDashboardStatsAction() {
  try {
    const [
      totalStudents,
      activeStudents,
      recentStudents,
      restrictedStudents,
    ] = await Promise.all([
      // Total count
      prisma.students.count(),
      // Active students (last 30 days)
      prisma.students.count({
        where: {
          users: { status: 'active' },
        },
      }),
      // Recent students (last 7 days)
      prisma.students.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      // Restricted students
      prisma.students.count({
        where: {
          users: { status: 'restricted' },
        },
      }),
    ]);

    return {
      success: true as const,
      stats: {
        totalStudents,
        activeStudents,
        recentStudents,
        restrictedStudents,
      },
    };
  } catch (error: any) {
    console.error("[DASHBOARD_STATS] Error:", error);
    return {
      success: false as const,
      error: error.message,
      stats: null,
    };
  }
}

/**
 * THE MATH: Get database-level metrics (TRUE counts with shadow data exposed)
 * 
 * CRITICAL: This function uses RAW, UNFILTERED queries to expose ALL students
 * including orphaned/unassigned records that would normally be hidden.
 * 
 * Architecture: "Option 2" - Separate statistical counts from paginated data lists.
 * - NO client-side .filter().length calculations
 * - NO WHERE clauses that hide shadow data
 * - Accounts for NULL/undefined collegeId values
 * 
 * Shadow Data Recovery: The groupBy explicitly includes records where collegeId
 * is null/undefined/unassigned so we don't lose ~5,000 students.
 * 
 * CACHED: 5 minute TTL (these are expensive aggregations)
 */
export async function getDatabaseMetricsAction() {
  return getCached(
    'database-metrics',
    {},
    async () => {
      try {
        // THE GLOBAL TRUTH: Absolute total with ZERO filters
        // This exposes ALL students including orphaned/pending/unassigned
        const masterCount = await prisma.students.count();
        
        console.log("[METRICS] Master student count (unfiltered):", masterCount);

        // THE COLLEGE GROUPING: Count students per college INCLUDING null collegeId
        // This prevents shadow data from disappearing
        const collegeGroups = await prisma.students.groupBy({
          by: ['collegeId'],
          _count: {
            id: true,
          },
          orderBy: {
            _count: {
              id: 'desc',
            },
          },
        });

        console.log("[METRICS] College groups found:", collegeGroups.length);
        
        // Convert to map for O(1) lookup
        const collegeCountMap: Record<string, number> = {};
        let unassignedCount = 0;
        
        collegeGroups.forEach((group) => {
          const collegeId = group.collegeId;
          const count = group._count.id;
          
          if (!collegeId || collegeId === 'col-unassigned' || collegeId === 'unassigned') {
            // Shadow data: Students without proper college assignment
            unassignedCount += count;
            collegeCountMap['unassigned'] = unassignedCount;
          } else {
            collegeCountMap[collegeId] = count;
          }
        });

        // Fetch college names for ID mapping (students table only has collegeId, not collegeName)
        const colleges = await prisma.colleges.findMany({
          where: { isDeleted: { not: true } },
          select: { id: true, name: true },
        });
        
        const collegeNameCountMap: Record<string, number> = {};
        
        colleges.forEach((college) => {
          const countById = collegeCountMap[college.id];
          if (countById) {
            collegeNameCountMap[college.name] = countById;
          }
        });

        // Additional aggregations for dashboard
        const [
          totalColleges,
          totalBatches,
          totalExams,
          activeStudentsCount,
        ] = await Promise.all([
          prisma.colleges.count(),
          prisma.batches.count(),
          prisma.exams.count(),
          prisma.students.count({ where: { users: { status: 'active' } } }),
        ]);

        const metrics = {
          // Master counts (THE MATH)
          masterStudentCount: masterCount,
          collegeStudentCounts: collegeCountMap,
          collegeNameCounts: collegeNameCountMap,
          unassignedStudents: unassignedCount,
          
          // Additional metrics
          totalColleges,
          totalBatches,
          totalExams,
          activeStudents: activeStudentsCount,
          
          // Metadata
          lastUpdated: new Date().toISOString(),
        };

        console.log("[METRICS] Complete metrics:", {
          masterCount,
          collegesWithCounts: Object.keys(collegeCountMap).length,
          collegeNamesWithCounts: Object.keys(collegeNameCountMap).length,
          unassignedStudents: unassignedCount,
        });

        return {
          success: true as const,
          metrics,
        };
      } catch (error: any) {
        console.error("[DATABASE_METRICS] Error:", error);
        return {
          success: false as const,
          error: error.message,
          metrics: null,
        };
      }
    }
  );
}

/**
 * OPTION 2 ARCHITECTURE: "THE LIST" - Paginated Data Fetching with Offset
 * Returns actual student records with pagination and filtering.
 * This complements getDatabaseMetricsAction() which provides THE MATH.
 * 
 * ARCHITECTURE NOTE:
 * - THE MATH (getDatabaseMetricsAction): Fast counts without loading records
 * - THE LIST (getStudentsPageAction): Paginated student data with filters
 * 
 * USAGE:
 * - Use getDatabaseMetricsAction() for dashboard stats and college cards
 * - Use getStudentsPageAction() for students table with Load More pagination
 */
export async function getStudentsPageAction(
  filters: StudentFilters = {},
  skip: number = 0,
  take: number = 100
) {
  return getCached(
    'students-page',
    { ...filters, skip, take },
    async () => {
      try {
        console.log(`[STUDENTS_PAGE] Fetching students - skip: ${skip}, take: ${take}`, filters);

        const where = buildStudentWhereClause(filters);

        // Get total count with filters (THE MATH for this filtered view)
        const total = await prisma.students.count({ where });

        // Fetch paginated student records (THE LIST)
        const students = await prisma.students.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            authId: true,
            collegeId: true,
            department: true,
            academicYear: true,
            section: true,
            enrollmentType: true,
            rollNumber: true,
            phone: true,
            createdAt: true,
            updatedAt: true,
            users: {
              select: {
                id: true,
                displayName: true,
                email: true,
                role: true,
                status: true,
              },
            },
            colleges: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            student_batches: {
              select: {
                batchId: true,
                batches: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        });

        const hasMore = skip + take < total;

        console.log(`[STUDENTS_PAGE] Returning ${students.length} students, total: ${total}, hasMore: ${hasMore}`);

        return {
          success: true as const,
          students,
          total,
          hasMore,
        };
      } catch (error: any) {
        console.error("[STUDENTS_PAGE] Error:", error);
        return {
          success: false as const,
          students: [],
          total: 0,
          hasMore: false,
          error: error.message,
        };
      }
    }
  );
}

/**
 * Search students - lightweight for autocomplete/search
 */
export async function searchStudentsAction(query: string, limit: number = 20) {
  if (!query || query.trim().length < 2) {
    return { success: true as const, students: [] };
  }

  try {
    const students = await prisma.students.findMany({
      where: {
        OR: [
          { users: { displayName: { contains: query, mode: 'insensitive' } } },
          { users: { email: { contains: query, mode: 'insensitive' } } },
          { rollNumber: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: Math.min(limit, 50),
      select: {
        id: true,
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
        department: true,
        academicYear: true,
      },
    });

    return { success: true as const, students };
  } catch (error: any) {
    console.error("[SEARCH_STUDENTS] Error:", error);
    return { success: false as const, error: error.message, students: [] };
  }
}
