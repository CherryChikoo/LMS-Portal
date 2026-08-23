"use server";

import { prisma } from "@/lib/prisma";

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  studentEmail: string;
  collegeId: string;
  collegeName: string;
  department: string;
  rollNumber: string;
  totalAttempts: number;
  totalScore: number;
  totalMaxMarks: number;
  averagePercentage: number;
  rank: number;
}

export interface LeaderboardFilters {
  collegeId?: string;
  department?: string;
  search?: string;
  userRole?: string;
  userCollegeId?: string;
  page?: number;
  limit?: number;
}

/**
 * DEPRECATED: Get leaderboard data - loads ALL exam_results then aggregates in JavaScript
 * Use getLeaderboardDataOptimizedAction() instead for database-level aggregation
 * 
 * @deprecated Use getLeaderboardDataOptimizedAction() for better performance
 */
export async function getLeaderboardDataAction(filters: LeaderboardFilters = {}) {
  console.warn("[DEPRECATED] getLeaderboardDataAction() loads ALL exam_results. Use getLeaderboardDataOptimizedAction() instead.");
  try {
    const { collegeId, department, search, userRole, userCollegeId, page = 1, limit = 30 } = filters;

    console.log("[LEADERBOARD_ACTION] Starting with filters:", filters);

    // Build where clause for students
    const whereStudent: any = {};

    // Only filter deleted if the field exists and is true
    // Don't filter by isDeleted to ensure we get results even if field is null
    
    // Role-based filtering
    const isCollegeScoped = userRole === "student" || userRole === "college_admin";
    if (isCollegeScoped && userCollegeId) {
      whereStudent.collegeId = userCollegeId;
      console.log("[LEADERBOARD_ACTION] College scoped to:", userCollegeId);
    } else if (collegeId && collegeId !== "all") {
      whereStudent.collegeId = collegeId;
      console.log("[LEADERBOARD_ACTION] Filtering by college:", collegeId);
    }

    if (department && department !== "all") {
      whereStudent.department = department;
    }

    console.log("[LEADERBOARD_ACTION] Where clause:", JSON.stringify(whereStudent));

    // Get all exam results with student info
    // If no specific filters, get all results
    const queryWhere = Object.keys(whereStudent).length > 0 
      ? { students: whereStudent }
      : {};

    console.log("[LEADERBOARD_ACTION] Query where:", JSON.stringify(queryWhere));

    const results = await prisma.exam_results.findMany({
      where: queryWhere,
      select: {
        studentId: true,
        score: true,
        totalMarks: true,
        percentage: true,
        students: {
          select: {
            id: true,
            collegeId: true,
            department: true,
            rollNumber: true,
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
        },
      },
    });

    console.log("[LEADERBOARD_ACTION] Found exam results:", results.length);
    if (results.length > 0) {
      console.log("[LEADERBOARD_ACTION] Sample result:", JSON.stringify(results[0], null, 2));
    }

    console.log("[LEADERBOARD_ACTION] Found exam results:", results.length);

    // Aggregate by student
    const studentStatsMap = new Map<string, {
      studentId: string;
      studentName: string;
      studentEmail: string;
      collegeId: string;
      collegeName: string;
      department: string;
      rollNumber: string;
      totalAttempts: number;
      totalScore: number;
      totalMaxMarks: number;
    }>();

    results.forEach((result) => {
      const studentId = result.studentId;
      const student = result.students;
      
      if (!student || !studentId) return;

      // Skip admin/test accounts
      const name = student.users?.displayName || "";
      if (name.toLowerCase().includes("admin") || 
          name.toLowerCase().includes("simulator") || 
          name.toLowerCase().includes("trainer")) {
        return;
      }

      const existing = studentStatsMap.get(studentId);
      
      if (existing) {
        existing.totalAttempts += 1;
        existing.totalScore += Number(result.score || 0);
        existing.totalMaxMarks += Number(result.totalMarks || 0);
      } else {
        studentStatsMap.set(studentId, {
          studentId,
          studentName: student.users?.displayName || "Unnamed Student",
          studentEmail: student.users?.email || "",
          collegeId: student.collegeId || "",
          collegeName: student.colleges?.name || "",
          department: student.department || "",
          rollNumber: student.rollNumber || "",
          totalAttempts: 1,
          totalScore: Number(result.score || 0),
          totalMaxMarks: Number(result.totalMarks || 0),
        });
      }
    });

    console.log("[LEADERBOARD_ACTION] Aggregated students:", studentStatsMap.size);

    // Convert to array and calculate percentages
    let leaderboard: LeaderboardEntry[] = Array.from(studentStatsMap.values()).map((stats) => {
      const avgPercentage = stats.totalMaxMarks > 0 
        ? (stats.totalScore / stats.totalMaxMarks) * 100 
        : 0;
      
      return {
        ...stats,
        // Ensure all numbers are properly serialized
        totalScore: Number(stats.totalScore),
        totalMaxMarks: Number(stats.totalMaxMarks),
        averagePercentage: Number((Math.round(avgPercentage * 10) / 10).toFixed(1)),
        rank: 0, // Will be assigned after sorting
      };
    });

    console.log("[LEADERBOARD_ACTION] Before filters - students:", leaderboard.length);

    // Apply search filter
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      leaderboard = leaderboard.filter((entry) =>
        entry.studentName.toLowerCase().includes(searchLower) ||
        entry.studentEmail.toLowerCase().includes(searchLower) ||
        entry.department.toLowerCase().includes(searchLower) ||
        entry.rollNumber.toLowerCase().includes(searchLower)
      );
      console.log("[LEADERBOARD_ACTION] After search filter:", leaderboard.length);
    }

    // Sort by total score, then average percentage, then attempts
    leaderboard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.averagePercentage !== a.averagePercentage) return b.averagePercentage - a.averagePercentage;
      return b.totalAttempts - a.totalAttempts;
    });

    // LIMIT TO TOP 100 STUDENTS
    const top100 = leaderboard.slice(0, 100);
    console.log("[LEADERBOARD_ACTION] Limited to top 100 students");

    // Assign ranks (only to top 100)
    top100.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Apply pagination on top 100
    const totalCount = top100.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = top100.slice(startIndex, endIndex);

    console.log("[LEADERBOARD_ACTION] Pagination - page:", page, "returning:", paginatedData.length, "of", totalCount);

    return {
      success: true as const,
      data: paginatedData,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  } catch (error: any) {
    console.error("[LEADERBOARD_ACTION] Error:", error);
    return {
      success: false as const,
      error: error.message || "Failed to load leaderboard",
      data: [],
      pagination: {
        page: 1,
        limit: 30,
        totalCount: 0,
        totalPages: 0,
        hasMore: false,
      },
    };
  }
}

/**
 * OPTIMIZED: Get leaderboard data using Prisma aggregation instead of raw SQL
 * More efficient than raw SQL with text casting, works better with indexes
 */
export async function getLeaderboardDataOptimizedAction(filters: LeaderboardFilters = {}) {
  try {
    const { collegeId, department, search, userRole, userCollegeId, page = 1, limit = 30 } = filters;

    console.log("[LEADERBOARD_OPTIMIZED] Starting with filters:", filters);

    // Build where clause for students
    const whereStudent: any = {};

    // Role-based filtering
    const isCollegeScoped = userRole === "student" || userRole === "college_admin";
    if (isCollegeScoped && userCollegeId) {
      whereStudent.collegeId = userCollegeId;
    } else if (collegeId && collegeId !== "all") {
      whereStudent.collegeId = collegeId;
    }

    if (department && department !== "all") {
      whereStudent.department = department;
    }

    // Build where clause for exam_results
    const whereResults: any = {};
    if (Object.keys(whereStudent).length > 0) {
      whereResults.students = whereStudent;
    }

    // Get aggregated results using Prisma groupBy
    // This is much faster than raw SQL with text casts
    const aggregatedResults = await prisma.exam_results.groupBy({
      by: ['studentId'],
      where: whereResults,
      _count: {
        id: true,
      },
      _sum: {
        score: true,
        totalMarks: true,
      },
      _avg: {
        percentage: true,
      },
      orderBy: {
        _sum: {
          score: 'desc',
        },
      },
      take: 100, // Limit to top 100 students
    });

    console.log("[LEADERBOARD_OPTIMIZED] Aggregated results:", aggregatedResults.length);

    // Get student details for the top 100
    const studentIds = aggregatedResults.map(r => r.studentId).filter(Boolean);
    
    const students = await prisma.students.findMany({
      where: {
        id: { in: studentIds },
      },
      select: {
        id: true,
        collegeId: true,
        department: true,
        rollNumber: true,
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
    });

    // Create a map for quick lookup
    const studentMap = new Map(students.map(s => [s.id, s]));

    // Combine aggregated data with student details
    let leaderboard: LeaderboardEntry[] = aggregatedResults
      .map((result) => {
        const student = studentMap.get(result.studentId);
        if (!student) return null;

        // Filter out admin/test accounts
        const name = student.users?.displayName || "";
        if (name.toLowerCase().includes("admin") || 
            name.toLowerCase().includes("simulator") || 
            name.toLowerCase().includes("trainer")) {
          return null;
        }

        const totalScore = Number(result._sum.score || 0);
        const totalMaxMarks = Number(result._sum.totalMarks || 0);
        const avgPercentage = totalMaxMarks > 0 
          ? (totalScore / totalMaxMarks) * 100 
          : Number(result._avg.percentage || 0);

        return {
          studentId: result.studentId,
          studentName: student.users?.displayName || "Unnamed Student",
          studentEmail: student.users?.email || "",
          collegeId: student.collegeId || "",
          collegeName: student.colleges?.name || "",
          department: student.department || "",
          rollNumber: student.rollNumber || "",
          totalAttempts: result._count.id,
          totalScore,
          totalMaxMarks,
          averagePercentage: Number((Math.round(avgPercentage * 10) / 10).toFixed(1)),
          rank: 0,
        };
      })
      .filter((entry): entry is LeaderboardEntry => entry !== null);

    console.log("[LEADERBOARD_OPTIMIZED] After filtering:", leaderboard.length);

    // Apply search filter
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      leaderboard = leaderboard.filter((entry) =>
        entry.studentName.toLowerCase().includes(searchLower) ||
        entry.studentEmail.toLowerCase().includes(searchLower) ||
        entry.department.toLowerCase().includes(searchLower) ||
        entry.rollNumber.toLowerCase().includes(searchLower)
      );
      console.log("[LEADERBOARD_OPTIMIZED] After search filter:", leaderboard.length);
    }

    // Assign ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Apply pagination
    const totalCount = leaderboard.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedData = leaderboard.slice(startIndex, endIndex);

    console.log("[LEADERBOARD_OPTIMIZED] Returning:", paginatedData.length, "of", totalCount);

    return {
      success: true as const,
      data: paginatedData,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  } catch (error: any) {
    console.error("[LEADERBOARD_OPTIMIZED] Error:", error);
    return {
      success: false as const,
      error: error.message || "Failed to load leaderboard",
      data: [],
      pagination: {
        page: 1,
        limit: 30,
        totalCount: 0,
        totalPages: 0,
        hasMore: false,
      },
    };
  }
}
