"use server";

import { prisma } from '@/lib/prisma';

// ============================================================================
// PAGINATED BATCH FETCHING (50K SCALE)
// ============================================================================

export async function getBatchesPaginatedAction({
  page = 1,
  pageSize = 100,
  collegeId,
  department,
  academicYear,
  userRole,
  userCollegeId,
}: {
  page?: number;
  pageSize?: number;
  collegeId?: string;
  department?: string;
  academicYear?: string;
  userRole?: string;
  userCollegeId?: string;
}) {
  try {
    // Build where clause
    const where: any = {};

    // Role-based scoping
    if ((userRole === "college_admin" || userRole === "student") && userCollegeId) {
      where.collegeId = userCollegeId;
    }

    // Filter by college
    if (collegeId && collegeId !== "ALL" && collegeId !== "GLOBAL") {
      where.collegeId = collegeId;
    }

    // Filter by department (case-insensitive exact match)
    if (department) {
      where.department = { equals: department, mode: 'insensitive' };
    }

    // Filter by academic year (case-insensitive exact match)
    if (academicYear) {
      where.academicYear = { equals: academicYear, mode: 'insensitive' };
    }

    // Calculate pagination
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Execute queries in parallel
    const [batches, totalCount] = await Promise.all([
      prisma.batches.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          collegeId: true,
          department: true,
          academicYear: true,
          section: true,
          status: true,
          createdAt: true,
          updatedAt: true,
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
      prisma.batches.count({ where }),
    ]);

    // Map to include studentCount
    const mappedBatches = batches.map((b) => ({
      ...b,
      studentCount: b._count.student_batches,
      collegeName: b.colleges?.name || null,
    }));

    console.log('[GET_BATCHES_PAGINATED] Returning:', {
      batchCount: mappedBatches.length,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      sampleBatch: mappedBatches[0]
    });

    return {
      success: true as const,
      data: mappedBatches,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  } catch (error: any) {
    console.error("[GET_BATCHES_PAGINATED] Error:", error);
    return {
      success: false as const,
      error: error.message || "Failed to fetch batches",
      data: [],
      totalCount: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    };
  }
}

// ============================================================================
// LEGACY ACTIONS (Keep for backwards compatibility)
// ============================================================================

export async function getAllBatchesAction() {
  return await prisma.batches.findMany({
    include: {
      student_batches: {
        select: { studentId: true }
      },
      _count: {
        select: { student_batches: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getBatchByIdAction(id: string) {
  return await prisma.batches.findUnique({
    where: { id },
    include: {
      student_batches: {
        select: { studentId: true }
      },
      _count: {
        select: { student_batches: true }
      }
    }
  });
}

// Get all students enrolled in a specific batch
export async function getStudentsInBatchAction(batchId: string) {
  const studentBatches = await prisma.student_batches.findMany({
    where: { batchId },
    select: {
      students: {
        select: {
          id: true,
          phone: true,
          department: true,
          academicYear: true,
          semester: true,
          section: true,
          rollNumber: true,
          enrollmentNo: true,
          enrollmentType: true,
          createdAt: true,
          updatedAt: true,
          collegeId: true,
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

  return studentBatches.map(sb => ({
    ...sb.students,
    name: sb.students.users?.displayName || sb.students.users?.email || 'Unknown',
    email: sb.students.users?.email || '',
    collegeName: sb.students.colleges?.name || null,
  }));
}

export async function getBatchesByCollegeAction(collegeId: string) {
  return await prisma.batches.findMany({
    where: { collegeId },
    include: {
      student_batches: {
        select: { studentId: true }
      },
      _count: {
        select: { student_batches: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createBatchAction(data: any) {
  // Whitelist only fields that exist in the Prisma `batches` model
  const cleanCollegeId = (!data.collegeId || data.collegeId === "GLOBAL" || data.collegeId === "all" || data.collegeId === "ALL" || data.collegeId === "global") ? null : data.collegeId;
  const cleanData: any = {
    name: data.name,
    collegeId: cleanCollegeId,
  };
  if (data.id) cleanData.id = data.id;
  if (data.description !== undefined) cleanData.description = data.description;
  if (data.department !== undefined) cleanData.department = data.department;
  if (data.academicYear !== undefined) cleanData.academicYear = data.academicYear;
  if (data.section !== undefined) cleanData.section = data.section;
  if (data.status !== undefined) cleanData.status = data.status;
  if (data.createdAt !== undefined) cleanData.createdAt = data.createdAt;
  if (data.updatedAt !== undefined) cleanData.updatedAt = data.updatedAt;

  const inserted = await prisma.batches.create({
    data: cleanData,
    select: { id: true }
  });
  return inserted.id;
}

export async function updateBatchAction(id: string, data: any) {
  // Whitelist only fields that exist in the Prisma `batches` model
  const cleanData: any = {};
  if (data.name !== undefined) cleanData.name = data.name;
  if (data.collegeId !== undefined) {
    cleanData.collegeId = (!data.collegeId || data.collegeId === "GLOBAL" || data.collegeId === "all" || data.collegeId === "ALL" || data.collegeId === "global") ? null : data.collegeId;
  }
  if (data.description !== undefined) cleanData.description = data.description;
  if (data.department !== undefined) cleanData.department = data.department;
  if (data.academicYear !== undefined) cleanData.academicYear = data.academicYear;
  if (data.section !== undefined) cleanData.section = data.section;
  if (data.status !== undefined) cleanData.status = data.status;
  if (data.updatedAt !== undefined) cleanData.updatedAt = data.updatedAt;

  await prisma.batches.update({
    where: { id },
    data: cleanData
  });
}

export async function deleteBatchAction(id: string) {
  await prisma.batches.delete({
    where: { id }
  });
}

export async function bulkAddStudentsToBatchAction(batchIdOrName: string, studentIds: string[]) {
  if (!batchIdOrName || !studentIds || studentIds.length === 0) return;
  
  // Find real batch ID
  const batch = await prisma.batches.findFirst({
    where: {
      OR: [
        { id: batchIdOrName },
        { name: batchIdOrName }
      ]
    },
    select: { id: true, collegeId: true }
  });
  if (!batch) return;

  let eligibleStudentIds = studentIds;
  if (batch.collegeId && batch.collegeId !== "GLOBAL" && batch.collegeId !== "global" && batch.collegeId !== "ALL" && batch.collegeId !== "unassigned" && batch.collegeId !== "UNASSIGNED") {
    // Look up the college to get both id and name
    const college = await prisma.colleges.findFirst({
      where: {
        OR: [
          { id: batch.collegeId },
          { name: batch.collegeId }
        ]
      },
      select: { id: true, name: true }
    });

    const validColIds = [batch.collegeId];
    if (college) {
      if (college.id) validColIds.push(college.id);
      if (college.name) validColIds.push(college.name);
    }

    const matchingStudents = await prisma.students.findMany({
      where: {
        id: { in: studentIds },
        collegeId: { in: validColIds },
      },
      select: { id: true }
    });
    eligibleStudentIds = matchingStudents.map((s) => s.id);
  }

  if (eligibleStudentIds.length === 0) return;

  const validBatchId = batch.id;
  await prisma.student_batches.createMany({
    data: eligibleStudentIds.map((sId) => ({
      studentId: sId,
      batchId: validBatchId,
    })),
    skipDuplicates: true,
  });
}

export async function bulkRemoveStudentsFromBatchAction(batchIdOrName: string, studentIds: string[]) {
  if (!batchIdOrName || !studentIds || studentIds.length === 0) return;

  const batch = await prisma.batches.findFirst({
    where: {
      OR: [
        { id: batchIdOrName },
        { name: batchIdOrName }
      ]
    },
    select: { id: true }
  });
  if (!batch) return;

  await prisma.student_batches.deleteMany({
    where: {
      batchId: batch.id,
      studentId: { in: studentIds }
    }
  });
}
