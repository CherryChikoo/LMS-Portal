"use server";

import { prisma } from "@/lib/prisma";

export async function fetchFullLMSStateAction() {
  try {
    const [colleges, batches, students, exams, resources, attempts] = await Promise.all([
      prisma.colleges.findMany({
        where: { isDeleted: false },
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
        include: {
          users: true,
          colleges: true,
          student_batches: {
            include: { batches: true },
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
    console.error("[LMS_SYNC_ACTION] Failed to fetch aggregate state:", err);
    return {
      success: false as const,
      error: err?.message || "Failed to load LMS data",
      data: null,
    };
  }
}
