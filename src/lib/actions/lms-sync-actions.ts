"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { invalidateCache } from "@/lib/cache/query-cache";

/**
 * CACHE BURSTING ACTION
 * Clears all server-side caches when a CRUD operation finishes so that 
 * subsequent fetches immediately reflect the accurate new counts.
 */
export async function revalidateAllDataCachesAction() {
  try {
    // 1. Clear the custom in-memory caching system
    invalidateCache();
    
    // 2. Instruct Next.js to flush its Router Cache and Data Cache across all paths
    revalidatePath('/', 'layout');
    
    return { success: true };
  } catch (error) {
    console.error("[CACHE_INVALIDATION] Failed to invalidate caches:", error);
    return { success: false };
  }
}

/**
 * OPTIMIZED: Dashboard-only aggregate for summary stats
 * Only fetches counts and recent 100 records instead of full datasets
 */
export async function fetchDashboardSummaryAction() {
  try {
    const [collegeCounts, studentCounts, examCounts, resourceCounts, batchCounts, recentStudents] = await Promise.all([
      // College count
      prisma.colleges.count(),
      // Student count
      prisma.students.count(),
      // Exam count
      prisma.exams.count(),
      // Resource count
      prisma.resources.count(),
      // Batch count
      prisma.batches.count(),
      // Recent 100 students only (for dashboard preview)
      prisma.students.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          authId: true,
          collegeId: true,
          department: true,
          academicYear: true,
          section: true,
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
        },
      }),
    ]);

    return {
      success: true as const,
      data: {
        counts: {
          colleges: collegeCounts,
          students: studentCounts,
          exams: examCounts,
          resources: resourceCounts,
          batches: batchCounts,
        },
        recentStudents,
      },
    };
  } catch (err: any) {
    console.error("[DASHBOARD_SUMMARY] Failed to fetch summary:", err);
    return {
      success: false as const,
      error: err?.message || "Failed to load dashboard summary",
      data: null,
    };
  }
}

/**
 * DEPRECATED: This function loads ALL students which causes massive egress.
 * Use fetchOptimizedLMSStateAction() instead for dashboard/cache.
 * Only kept for backward compatibility with legacy code paths.
 * 
 * @deprecated Use fetchOptimizedLMSStateAction() for dashboard/cache operations
 */
export async function fetchFullLMSStateAction() {
  console.warn("[DEPRECATED] fetchFullLMSStateAction() called - this loads ALL students. Use fetchOptimizedLMSStateAction() instead.");
  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const [colleges, batches, students, exams, resources, attempts] = await Promise.all([
        prisma.colleges.findMany({
          orderBy: { createdAt: "desc" },
        }),
        // Load ALL batches
        prisma.batches.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { student_batches: true } },
            student_batches: { 
              select: { studentId: true }
            },
          },
        }),
        // Load ALL students with optimized fields
        // With indexes, this will be fast
        prisma.students.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            authId: true,
            collegeId: true,
            department: true,
            academicYear: true,
            section: true,
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
        prisma.exams.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { questions: true } }
          }
        }),
        prisma.resources.findMany({
          orderBy: { createdAt: "desc" },
        }),
        // Fetch ALL exam results for leaderboard calculations
        prisma.exam_results.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            examId: true,
            studentId: true,
            score: true,
            totalMarks: true,
            percentage: true,
            passed: true,
            status: true,
            correctCount: true,
            incorrectCount: true,
            timeTakenMinutes: true,
            startTime: true,
            submittedAt: true,
            createdAt: true,
            updatedAt: true,
            exams: {
              select: {
                title: true,
                collegeId: true,
              },
            },
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
          },
        }),
      ]);

      // Map attempts to include flattened fields for compatibility
      // Convert Decimal types to numbers for JSON serialization
      const mappedAttempts = attempts.map((att: any) => ({
        id: att.id,
        examId: att.examId,
        studentId: att.studentId,
        score: att.score !== null && att.score !== undefined ? Number(att.score) : 0,
        totalMarks: att.totalMarks !== null && att.totalMarks !== undefined ? Number(att.totalMarks) : 0,
        // Convert Prisma Decimal to number for client serialization
        percentage: att.percentage !== null && att.percentage !== undefined ? Number(String(att.percentage)) : 0,
        passed: att.passed,
        status: att.status,
        correctCount: att.correctCount,
        incorrectCount: att.incorrectCount,
        timeTakenMinutes: att.timeTakenMinutes,
        startTime: att.startTime ? att.startTime.toISOString() : null,
        submittedAt: att.submittedAt ? att.submittedAt.toISOString() : null,
        createdAt: att.createdAt ? att.createdAt.toISOString() : null,
        updatedAt: att.updatedAt ? att.updatedAt.toISOString() : null,
        examTitle: att.exams?.title || "Unknown Exam",
        studentName: att.students?.users?.displayName || "Unknown Student",
        studentEmail: att.students?.users?.email || "",
      }));

      return {
        success: true as const,
        data: {
          colleges,
          batches,
          students,
          exams,
          resources,
          attempts: mappedAttempts,
        },
      };
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err?.code === "ETIMEDOUT" ||
        err?.code === "ECONNRESET" ||
        err?.code === "ECONNREFUSED" ||
        err?.message?.includes("Connection terminated") ||
        err?.message?.includes("timeout") ||
        err?.message?.includes("connection") ||
        err?.message?.includes("FATAL");

      if (isTransient && attempt < MAX_RETRIES) {
        // Wait 1s before retrying on transient connection errors
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  console.error("[LMS_SYNC_ACTION] Failed to fetch aggregate state after retries:", lastError);
  return {
    success: false as const,
    error: lastError?.message || "Failed to load LMS data",
    data: null,
  };
}

/**
 * OPTIMIZED LMS State Action - Loads only metadata and counts
 * Does NOT load all students - significantly reduces egress
 * 
 * Returns:
 * - Full colleges array (small dataset ~30-100 records)
 * - Full batches array with student counts (not student IDs)
 * - EMPTY students array (use pagination endpoints instead)
 * - Full exams array without questions (lazy load questions)
 * - Full resources array  
 * - EMPTY attempts array (use per-student/per-exam queries instead)
 * - Metadata with total counts
 */
export async function fetchOptimizedLMSStateAction() {
  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const [
        colleges,
        batches,
        studentCount,
        exams,
        resources,
        attemptCount,
      ] = await Promise.all([
        // Load ALL colleges (small dataset ~30-100 records)
        prisma.colleges.findMany({
          orderBy: { createdAt: "desc" },
        }),
        
        // Load ALL batches with student COUNTS only (not full student arrays)
        prisma.batches.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { student_batches: true } },
            // REMOVED: student_batches array - only count needed
          },
        }),
        
        // COUNT students instead of loading all
        prisma.students.count(),
        
        // Load ALL exams WITHOUT questions (lazy load questions when exam is opened)
        prisma.exams.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { questions: true } },
            // REMOVED: questions array - lazy load when needed
          },
        }),
        
        // Load ALL resources (small dataset)
        prisma.resources.findMany({
          orderBy: { createdAt: "desc" },
        }),
        
        // COUNT exam_results instead of loading all
        prisma.exam_results.count(),
      ]);

      return {
        success: true as const,
        data: {
          colleges,
          batches,
          students: [], // Empty - use getStudentsPaginatedAction() instead
          exams,
          resources,
          attempts: [], // Empty - use per-student queries instead
          metadata: {
            studentCount,
            attemptCount,
            timestamp: new Date().toISOString(),
          },
        },
      };
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err?.code === "ETIMEDOUT" ||
        err?.code === "ECONNRESET" ||
        err?.code === "ECONNREFUSED" ||
        err?.message?.includes("Connection terminated") ||
        err?.message?.includes("timeout") ||
        err?.message?.includes("connection") ||
        err?.message?.includes("FATAL");

      if (isTransient && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  console.error("[LMS_SYNC_ACTION] Failed to fetch optimized state after retries:", lastError);
  return {
    success: false as const,
    error: lastError?.message || "Failed to load LMS data",
    data: null,
  };
}
