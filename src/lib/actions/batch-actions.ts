"use server";

import { prisma } from '@/lib/prisma';

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
