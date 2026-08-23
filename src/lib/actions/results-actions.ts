"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/utils/auth-session";

export interface ResultsFilters {
  collegeId?: string;
  department?: string;
  academicYear?: string;
  section?: string;
  batchId?: string;
  studentFilter?: string; // "ALL" or specific name
  examFilter?: string; // "ALL" or specific ID
  outcomeFilter?: string; // "ALL", "PASSED", "FAILED"
  searchQuery?: string;
  sortBy?: "score_desc" | "score_asc" | "date_desc";
  page: number;
  limit: number;
  userContext?: {
    role: string;
    id?: string;
    authId?: string;
    email?: string;
    collegeId?: string;
  };
}

export async function getPaginatedResultsAction(filters: ResultsFilters) {
  try {
    const user = filters.userContext;
    if (!user) {
      throw new Error("Unauthorized");
    }

    const {
      collegeId,
      department,
      academicYear,
      section,
      batchId,
      studentFilter,
      examFilter,
      outcomeFilter,
      searchQuery,
      sortBy = "date_desc",
      page = 1,
      limit = 25,
    } = filters;

    // 1. Build Prisma Where Clause
    const where: any = {};

    // --- RLS & Hierarchy Filters ---
    if (user.role === "student") {
      where.OR = [
        { studentId: user.id },
        { studentId: user.authId },
      ];
      if (user.email) {
        where.OR.push({
          students: { users: { email: { equals: user.email, mode: "insensitive" } } },
        });
      }
    } else {
      // Role-based college scoping
      if (user.role === "college_admin") {
        if (!user.collegeId) {
          throw new Error("Unauthorized: College Admin must have an assigned college ID");
        }
        where.students = { ...where.students, collegeId: user.collegeId };
      } else if (collegeId && collegeId !== "ALL") {
        where.students = { ...where.students, collegeId };
      }

      if (department && department !== "ALL") {
        where.students = { ...where.students, department };
      }
      if (academicYear && academicYear !== "ALL") {
        where.students = { ...where.students, academicYear };
      }
      if (section && section !== "ALL") {
        where.students = { ...where.students, section };
      }
      if (batchId && batchId !== "ALL") {
        where.students = {
          ...where.students,
          student_batches: {
            some: { batchId },
          },
        };
      }
      if (studentFilter && studentFilter !== "ALL") {
        // studentFilter in UI is a string name or email
        // We'll search across users table displayName or email
        where.students = {
          ...where.students,
          users: {
            OR: [
              { displayName: { contains: studentFilter, mode: "insensitive" } },
              { email: { contains: studentFilter, mode: "insensitive" } },
            ]
          }
        };
      }
    }

    // --- Assessment Filters ---
    if (examFilter && examFilter !== "ALL") {
      where.examId = examFilter;
    }
    if (outcomeFilter === "PASSED") {
      where.passed = true;
    } else if (outcomeFilter === "FAILED") {
      where.passed = false;
    }

    // --- Search Query ---
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      where.OR = [
        ...(where.OR || []),
        {
          students: {
            users: {
              OR: [
                { displayName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ]
            }
          }
        },
        {
          exams: {
            title: { contains: q, mode: "insensitive" }
          }
        },
        { examId: { contains: q, mode: "insensitive" } },
        { studentId: { contains: q, mode: "insensitive" } }
      ];
    }

    // 2. Build Sort Order
    let orderBy: any = { createdAt: "desc" };
    if (sortBy === "score_desc") {
      orderBy = { percentage: "desc" };
    } else if (sortBy === "score_asc") {
      orderBy = { percentage: "asc" };
    } else if (sortBy === "date_desc") {
      orderBy = { submittedAt: { sort: "desc", nulls: "last" } };
    }

    // 3. Execute Queries in Parallel
    const skip = (page - 1) * limit;

    const [attemptsRaw, totalCount, passedCount, scoreAggregates] = await Promise.all([
      prisma.exam_results.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          examId: true,
          studentId: true,
          score: true,
          totalMarks: true,
          percentage: true,
          passed: true,
          status: true,
          createdAt: true,
          submittedAt: true,
          timeTakenMinutes: true,
          // Only select minimal needed fields from relations
          exams: {
            select: { 
              title: true, 
              collegeId: true 
            },
          },
          students: {
            select: {
              users: { 
                select: { 
                  displayName: true, 
                  email: true 
                } 
              },
              colleges: { 
                select: { 
                  name: true 
                } 
              },
              department: true,
              academicYear: true,
              section: true,
            },
          },
        },
      }),
      prisma.exam_results.count({ where }),
      prisma.exam_results.count({ where: { ...where, passed: true } }),
      prisma.exam_results.aggregate({
        where,
        _avg: { percentage: true },
        _max: { percentage: true },
      }),
    ]);

    // Map attempts to include necessary flattened fields
    // Convert Decimal types and Dates to JSON-serializable formats
    const mappedAttempts = attemptsRaw.map((a: any) => ({
      id: a.id,
      examId: a.examId,
      studentId: a.studentId,
      score: a.score !== null && a.score !== undefined ? Number(a.score) : null,
      totalMarks: a.totalMarks !== null && a.totalMarks !== undefined ? Number(a.totalMarks) : null,
      // Convert Prisma Decimal to number for client serialization
      percentage: a.percentage !== null && a.percentage !== undefined ? Number(String(a.percentage)) : null,
      passed: a.passed,
      status: a.status,
      createdAt: a.createdAt ? a.createdAt.toISOString() : null,
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
      timeTakenMinutes: a.timeTakenMinutes,
      examTitle: a.exams?.title || "Unknown Exam",
      collegeId: a.exams?.collegeId,
      studentName: a.students?.users?.displayName || "Unknown Student",
      collegeName: a.students?.colleges?.name || "",
      studentEmail: a.students?.users?.email || "",
      department: a.students?.department || "",
      academicYear: a.students?.academicYear || "",
      section: a.students?.section || "",
    }));

    const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    const avgScore = scoreAggregates._avg.percentage ? Math.round(Number(scoreAggregates._avg.percentage)) : 0;
    const highestScore = scoreAggregates._max.percentage ? Math.round(Number(scoreAggregates._max.percentage)) : 0;

    return {
      success: true,
      data: {
        attempts: mappedAttempts,
        totalCount,
        passRate,
        avgScore,
        highestScore,
        page,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  } catch (error: any) {
    console.error("[RESULTS_ACTIONS] Error fetching paginated results:", error);
    return { success: false, error: error.message };
  }
}
