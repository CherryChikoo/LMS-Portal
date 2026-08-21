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
      prisma.colleges.count({
        where: { NOT: { isDeleted: true } }
      }),
      // Student count
      prisma.students.count(),
      // Exam count
      prisma.exams.count({
        where: { deletedAt: null }
      }),
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
 * Single aggregate server action that fetches ALL LMS collections in one
 * serverless invocation. This prevents connection pool exhaustion by running
 * all queries within a single lambda instance sharing one DB connection.
 *
 * OPTIMIZED: Now limits students to recent 100 for initial load
 *
 * Includes retry logic for transient connection failures.
 */
export async function fetchFullLMSStateAction() {
  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const [colleges, batches, students, exams, resources, attempts] = await Promise.all([
        prisma.colleges.findMany({
          where: { NOT: { isDeleted: true } },
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
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        }),
        prisma.resources.findMany({
          orderBy: { createdAt: "desc" },
        }),
        // Load ALL exam results
        prisma.exam_results.findMany({
          orderBy: { createdAt: "desc" },
          take: 2000, // Reasonable limit for exam results
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
          },
        }),
      ]);

      return {
        success: true as const,
        data: {
          colleges,
          batches,
          students,
          exams,
          resources,
          attempts: attempts.map((a: any) => ({
            ...a,
            percentage: a.percentage ? Number(a.percentage) : null,
          })),
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
