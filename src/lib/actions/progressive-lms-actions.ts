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
 * DEPRECATED: Fast initial load - but still loads ALL exam_results
 * Use fetchOptimizedLMSInitialStateAction() instead
 * 
 * @deprecated Use fetchOptimizedLMSInitialStateAction() instead
 */
export async function fetchLMSInitialStateAction() {
  console.warn("[DEPRECATED] fetchLMSInitialStateAction() loads ALL exam_results. Use fetchOptimizedLMSInitialStateAction() instead.");
  try {
    const startTime = Date.now();
    
    const [
      collegeCount,
      studentCount,
      batchCount,
      examCount,
      resourceCount,
    ] = await Promise.all([
      // Counts (super fast with indexes)
      prisma.colleges.count(),
      prisma.students.count(),
      prisma.batches.count(),
      prisma.exams.count(),
      prisma.resources.count(),
    ]);
    
    const [
      colleges,
      batches,
      exams,
      resources,
      attempts,
      recentStudents,
    ] = await Promise.all([
      // Full small datasets (colleges, batches, exams, resources are small)
      prisma.colleges.findMany({
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
        students: recentStudents,
        exams,
        resources,
        attempts: mappedAttempts,
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
 * OPTIMIZED: Fast initial load - NO full student/attempt arrays
 * Returns metadata and counts only - designed for 50K+ students
 * 
 * Returns EMPTY arrays for students and attempts
 * Use specific queries (getStudentsPaginatedAction, etc.) to fetch actual data
 */
export async function fetchOptimizedLMSInitialStateAction() {
  try {
    const startTime = Date.now();
    
    const [
      collegeCount,
      studentCount,
      batchCount,
      examCount,
      resourceCount,
      attemptCount,
    ] = await Promise.all([
      // Counts (super fast with indexes)
      prisma.colleges.count(),
      prisma.students.count(),
      prisma.batches.count(),
      prisma.exams.count(),
      prisma.resources.count(),
      prisma.exam_results.count(),
    ]);
    
    const [
      colleges,
      batches,
      exams,
      resources,
    ] = await Promise.all([
      // Full small datasets (colleges, batches, exams, resources are small)
      prisma.colleges.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.batches.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { student_batches: true } },
          // REMOVED: student_batches array - only count needed
        },
      }),
      prisma.exams.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { questions: true } }
          // REMOVED: questions array - lazy load when needed
        }
      }),
      prisma.resources.findMany({
        orderBy: { createdAt: "desc" },
      }),
      // REMOVED: attempts query - use per-student queries instead
      // REMOVED: students query - use paginated queries instead
    ]);

    const duration = Date.now() - startTime;
    console.log(`[LMS_OPTIMIZED_INITIAL_STATE] Loaded in ${duration}ms (counts only)`);

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
          counts: {
            colleges: collegeCount,
            students: studentCount,
            batches: batchCount,
            exams: examCount,
            resources: resourceCount,
            attempts: attemptCount,
          },
          studentsLoaded: 0,
          studentsTotal: studentCount,
          loadTime: duration,
        },
      },
    };
  } catch (err: any) {
    console.error("[LMS_OPTIMIZED_INITIAL_STATE] Failed:", err);
    return {
      success: false as const,
      error: err?.message || "Failed to load optimized initial state",
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
