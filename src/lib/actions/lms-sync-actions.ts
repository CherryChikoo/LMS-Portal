"use server";

import { prisma } from "@/lib/prisma";

/**
 * Single aggregate server action that fetches ALL LMS collections in one
 * serverless invocation. This prevents connection pool exhaustion by running
 * all queries within a single lambda instance sharing one DB connection.
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
        prisma.batches.findMany({
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { student_batches: true } },
            student_batches: { select: { studentId: true } },
          },
        }),
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
        prisma.exam_results.findMany({
          orderBy: { createdAt: "desc" },
          take: 1000,
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
          attempts,
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
