"use server";

import { prisma } from "@/lib/prisma";

const CHUNK_SIZE = 500; // Load 500 students at a time

/**
 * Progressive student loading - returns metadata + first chunk
 * Client can then request additional chunks
 */
export async function fetchStudentsProgressiveAction(page = 0) {
  try {
    const [total, students] = await Promise.all([
      // Get total count (fast with indexes)
      page === 0 ? prisma.students.count() : Promise.resolve(0),
      
      // Load one chunk of students
      prisma.students.findMany({
        skip: page * CHUNK_SIZE,
        take: CHUNK_SIZE,
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
    ]);

    const totalPages = page === 0 ? Math.ceil(total / CHUNK_SIZE) : 0;

    return {
      success: true as const,
      data: {
        students,
        metadata: {
          total: page === 0 ? total : undefined,
          page,
          pageSize: CHUNK_SIZE,
          totalPages: page === 0 ? totalPages : undefined,
          hasMore: students.length === CHUNK_SIZE,
        },
      },
    };
  } catch (err: any) {
    console.error("[PROGRESSIVE_STUDENTS] Failed:", err);
    return {
      success: false as const,
      error: err?.message || "Failed to load students",
      data: null,
    };
  }
}

/**
 * Fast initial load - gets counts + minimal data for instant UI
 */
export async function fetchLMSInitialStateAction() {
  try {
    const startTime = Date.now();
    
    const [
      collegeCount,
      studentCount,
      batchCount,
      examCount,
      resourceCount,
      colleges,
      batches,
      exams,
      resources,
      recentStudents,
    ] = await Promise.all([
      // Counts (super fast with indexes)
      prisma.colleges.count({ where: { NOT: { isDeleted: true } } }),
      prisma.students.count(),
      prisma.batches.count(),
      prisma.exams.count({ where: { deletedAt: null } }),
      prisma.resources.count(),
      
      // Full small datasets (colleges, batches, exams, resources are small)
      prisma.colleges.findMany({
        where: { NOT: { isDeleted: true } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.batches.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { student_batches: true } },
          student_batches: { 
            select: { studentId: true }
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
      
      // Only first 100 students for initial render
      prisma.students.findMany({
        take: 100,
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
    ]);

    const duration = Date.now() - startTime;
    console.log(`[LMS_INITIAL_STATE] Loaded in ${duration}ms`);

    return {
      success: true as const,
      data: {
        colleges,
        batches,
        students: recentStudents,
        exams,
        resources,
        attempts: [], // Will load separately if needed
        metadata: {
          counts: {
            colleges: collegeCount,
            students: studentCount,
            batches: batchCount,
            exams: examCount,
            resources: resourceCount,
          },
          studentsLoaded: recentStudents.length,
          studentsTotal: studentCount,
          loadTime: duration,
        },
      },
    };
  } catch (err: any) {
    console.error("[LMS_INITIAL_STATE] Failed:", err);
    return {
      success: false as const,
      error: err?.message || "Failed to load initial state",
      data: null,
    };
  }
}

/**
 * Load remaining students in background after initial render
 */
export async function fetchRemainingStudentsAction(skip: number) {
  try {
    const students = await prisma.students.findMany({
      skip,
      take: CHUNK_SIZE,
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
    });

    return {
      success: true as const,
      data: {
        students,
        hasMore: students.length === CHUNK_SIZE,
        nextSkip: skip + students.length,
      },
    };
  } catch (err: any) {
    console.error("[REMAINING_STUDENTS] Failed:", err);
    return {
      success: false as const,
      error: err?.message || "Failed to load remaining students",
      data: null,
    };
  }
}
