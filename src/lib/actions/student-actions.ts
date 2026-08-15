"use server";

import { prisma } from '@/lib/prisma';
import type { Student } from "@/types";

export async function getAllStudentsAction() {
  return await prisma.students.findMany({
    include: {
      users: true,
      colleges: true,
      student_batches: {
        include: { batches: true }
      }
    }
  });
}

export async function getStudentsByCollegeAction(collegeId: string) {
  return await prisma.students.findMany({
    where: { 
      OR: [
        { collegeId },
        { colleges: { id: collegeId } },
        { colleges: { name: { equals: collegeId, mode: 'insensitive' } } }
      ]
    },
    include: {
      users: true,
      colleges: true,
      student_batches: {
        include: { batches: true }
      }
    }
  });
}

export async function getStudentsByBatchAction(batchId: string) {
  const data = await prisma.student_batches.findMany({
    where: {
      OR: [
        { batchId },
        { batches: { name: batchId } }
      ]
    },
    include: {
      students: {
        include: {
          users: true,
          colleges: true,
          student_batches: {
            include: { batches: true }
          }
        }
      }
    }
  });
  return data;
}

export async function getStudentByIdAction(studentId: string) {
  return await prisma.students.findUnique({
    where: { id: studentId },
    include: {
      users: true,
      colleges: true,
      student_batches: {
        include: { batches: true }
      }
    }
  });
}

export async function getStudentByEmailAction(email: string) {
  return await prisma.students.findFirst({
    where: { users: { email: email.toLowerCase() } },
    include: {
      users: true,
      colleges: true,
      student_batches: {
        include: { batches: true }
      }
    }
  });
}

export async function createStudentProfileAction(data: any) {
  const studentPayload: any = {
    id: data.id,
    collegeId: (!data.collegeId || data.collegeId === "GLOBAL" || data.collegeId === "all" || data.collegeId === "ALL" || data.collegeId === "global") ? null : data.collegeId,
  };
  if (data.phone !== undefined) studentPayload.phone = data.phone;
  if (data.department !== undefined) studentPayload.department = data.department;
  if (data.academicYear !== undefined) studentPayload.academicYear = data.academicYear;
  if (data.semester !== undefined) studentPayload.semester = typeof data.semester === "number" ? data.semester : (parseInt(data.semester, 10) || null);
  if (data.section !== undefined) studentPayload.section = data.section;
  if (data.rollNumber !== undefined) studentPayload.rollNumber = data.rollNumber;
  if (data.enrollmentNo !== undefined) studentPayload.enrollmentNo = data.enrollmentNo;
  if (data.mustChangePassword !== undefined) studentPayload.mustChangePassword = data.mustChangePassword;
  if (data.enrollmentType !== undefined) studentPayload.enrollmentType = data.enrollmentType;
  if (data.authId !== undefined) studentPayload.authId = data.authId;

  const inserted = await prisma.students.create({
    data: studentPayload,
    select: { id: true }
  });

  // Batch assignments if batchIds provided
  if (Array.isArray(data.batchIds) && data.batchIds.length > 0) {
    const validBatchIds = data.batchIds.filter(Boolean);
    if (validBatchIds.length > 0) {
      const existingBatches = await prisma.batches.findMany({
        where: {
          OR: [
            { id: { in: validBatchIds } },
            { name: { in: validBatchIds } }
          ]
        },
        select: { id: true }
      });
      const existingIds = existingBatches.map((b: any) => b.id);
      if (existingIds.length > 0) {
        await prisma.student_batches.createMany({
          data: existingIds.map((bId: string) => ({
            studentId: inserted.id,
            batchId: bId
          })),
          skipDuplicates: true
        });
      }
    }
  }

  return inserted.id;
}

export async function updateStudentProfileAction(studentId: string, whitelistedData: any) {
  await prisma.$transaction(async (tx: any) => {
    if (Object.keys(whitelistedData).length > 0) {
      // 1. Clean student fields
      const studentPayload: any = {};
      if (whitelistedData.collegeId !== undefined) {
        studentPayload.collegeId = (!whitelistedData.collegeId || whitelistedData.collegeId === "GLOBAL" || whitelistedData.collegeId === "all" || whitelistedData.collegeId === "ALL" || whitelistedData.collegeId === "global") ? null : whitelistedData.collegeId;
      }
      if (whitelistedData.phone !== undefined) studentPayload.phone = whitelistedData.phone;
      if (whitelistedData.department !== undefined) studentPayload.department = whitelistedData.department;
      if (whitelistedData.academicYear !== undefined) studentPayload.academicYear = whitelistedData.academicYear;
      if (whitelistedData.semester !== undefined) studentPayload.semester = typeof whitelistedData.semester === "number" ? whitelistedData.semester : (parseInt(whitelistedData.semester, 10) || null);
      if (whitelistedData.section !== undefined) studentPayload.section = whitelistedData.section;
      if (whitelistedData.rollNumber !== undefined) studentPayload.rollNumber = whitelistedData.rollNumber;
      if (whitelistedData.enrollmentNo !== undefined) studentPayload.enrollmentNo = whitelistedData.enrollmentNo;
      if (whitelistedData.mustChangePassword !== undefined) studentPayload.mustChangePassword = whitelistedData.mustChangePassword;
      if (whitelistedData.enrollmentType !== undefined) studentPayload.enrollmentType = whitelistedData.enrollmentType;
      if (whitelistedData.updatedAt !== undefined) {
        studentPayload.updatedAt = new Date(whitelistedData.updatedAt);
      } else {
        studentPayload.updatedAt = new Date();
      }

      if (Object.keys(studentPayload).length > 0) {
        await tx.students.update({
          where: { id: studentId },
          data: studentPayload
        });
      }

      // 2. Clean user fields
      const userPayload: any = {};
      if (whitelistedData.name) userPayload.displayName = whitelistedData.name.trim();
      if (whitelistedData.displayName) userPayload.displayName = whitelistedData.displayName.trim();
      if (whitelistedData.email) userPayload.email = whitelistedData.email.toLowerCase().trim();
      if (whitelistedData.status) userPayload.status = whitelistedData.status;
      if (whitelistedData.collegeId !== undefined) {
        userPayload.collegeId = (!whitelistedData.collegeId || whitelistedData.collegeId === "GLOBAL" || whitelistedData.collegeId === "all" || whitelistedData.collegeId === "ALL" || whitelistedData.collegeId === "global") ? null : whitelistedData.collegeId;
      }
      if (Object.keys(userPayload).length > 0) {
        userPayload.updatedAt = new Date();
        await tx.users.update({
          where: { id: studentId },
          data: userPayload
        });
      }

      // 3. Batch assignments if batchIds provided
      if (Array.isArray(whitelistedData.batchIds)) {
        await tx.student_batches.deleteMany({ where: { studentId } });
        const validBatchIds = whitelistedData.batchIds.filter(Boolean);
        for (const bRaw of validBatchIds) {
          const bName = String(bRaw).trim();
          if (!bName) continue;
          let existingBatches = await tx.batches.findMany({
            where: {
              OR: [
                { id: bName },
                { name: { equals: bName, mode: "insensitive" } }
              ]
            },
            select: { id: true }
          });
          if (existingBatches.length === 0) {
            const newBatchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const created = await tx.batches.create({
              data: {
                id: newBatchId,
                name: bName,
                collegeId: whitelistedData.collegeId || null,
                department: whitelistedData.department || null,
                academicYear: whitelistedData.academicYear || null,
                section: whitelistedData.section || null,
              },
              select: { id: true }
            });
            existingBatches = [created];
          }
          for (const b of existingBatches) {
            await tx.student_batches.create({
              data: { studentId, batchId: b.id }
            }).catch(() => {});
          }
        }
      }
    }
  });
}

export async function getTrainerNotesAction(studentId: string) {
  return await prisma.trainer_notes.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
}

export async function addTrainerNoteAction(note: any) {
  const data = await prisma.trainer_notes.create({
    data: note,
    select: { id: true }
  });
  return data.id;
}

export async function checkStudentEmailExistsAction(email: string) {
  const existing = await prisma.students.findFirst({
    where: { users: { email } }
  });
  return !!existing;
}

export async function resilientStudentFallbackAction(docId: string, cleanEmail: string, studentName: string, studentDoc: any, userDoc: any) {
  const rawColId = studentDoc.collegeId || userDoc.collegeId;
  const isSpecial = !rawColId || ["global", "all", "unassigned", "col-unassigned"].includes(String(rawColId).toLowerCase());
  let validColId: string | null = null;

  if (!isSpecial) {
    const colExists = await prisma.colleges.findFirst({
      where: {
        OR: [
          { id: String(rawColId) },
          { name: { equals: String(rawColId), mode: "insensitive" } }
        ]
      },
      select: { id: true }
    });
    if (colExists) {
      validColId = colExists.id;
    } else {
      const newCol = await prisma.colleges.create({
        data: {
          id: String(rawColId),
          name: String(rawColId),
          code: String(rawColId).substring(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "") || "COL",
          type: "external",
          departments: ["General"],
        },
        select: { id: true }
      });
      validColId = newCol.id;
    }
  }

  const cleanUserDoc = { ...userDoc, collegeId: validColId };
  const cleanStudentDoc = { ...studentDoc, collegeId: validColId };

  await prisma.$transaction(async (tx: any) => {
    // Upsert user
    await tx.users.upsert({
      where: { id: docId },
      update: cleanUserDoc,
      create: cleanUserDoc
    });
    // Upsert student
    await tx.students.upsert({
      where: { id: docId },
      update: cleanStudentDoc,
      create: cleanStudentDoc
    });
  });
}
