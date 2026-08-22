"use server";

import { prisma } from '@/lib/prisma';
import type { College } from "@/types";

export async function fetchCollegesAction() {
  // OPTIMIZED: Load all colleges (typically not more than 100-200)
  const data = await prisma.colleges.findMany({
    orderBy: { createdAt: 'desc' },
    where: { NOT: { isDeleted: true } }
  });
  return data;
}

export async function getCollegeCountAction() {
  // Get total college count
  return await prisma.colleges.count({
    where: { NOT: { isDeleted: true } }
  });
}

export async function fetchCollegeByIdAction(id: string) {
  return await prisma.colleges.findUnique({ where: { id } });
}

export async function createCollegeAction(data: any) {
  const { initialPassword, loginEnabled, ...validData } = data;
  const inserted = await prisma.colleges.create({
    data: validData,
    select: { id: true }
  });
  return { success: true, id: inserted.id };
}

export async function upsertCollegeAction(data: any) {
  const { initialPassword, loginEnabled, ...validData } = data;
  const id = validData.id || validData.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return await prisma.colleges.upsert({
    where: { id },
    update: validData,
    create: { id, ...validData }
  });
}

export async function updateCollegeAction(id: string, updateData: any) {
  const { initialPassword, loginEnabled, ...validData } = updateData || {};
  await prisma.colleges.update({
    where: { id },
    data: validData
  });
  if (validData.status !== undefined) {
    await prisma.users.updateMany({
      where: { collegeId: id, role: "college_admin" },
      data: { status: validData.status, updatedAt: new Date() }
    });
  }
}

export async function fetchCollegeStudentCountAction(collegeId: string) {
  return await prisma.students.count({
    where: { collegeId }
  });
}

export async function softDeleteCollegeAction(id: string) {
  // Hard delete the college instead of soft deleting
  await prisma.colleges.delete({
    where: { id }
  });
}

export async function restoreCollegeAction(id: string) {
  await prisma.colleges.update({
    where: { id },
    data: { isDeleted: false, status: "active", updatedAt: new Date() }
  });
}

export async function renameCollegeAndMigrateAction(
  collegeId: string,
  oldName: string,
  newName: string,
  isExternal: boolean = false
) {
  const normalizedNewName = newName.trim();
  const normalizedOldName = oldName.trim();

  // Use Prisma transaction for atomicity!
  await prisma.$transaction(async (tx: any) => {
    // 1. Find the college record by ID or old name
    const foundCol = await tx.colleges.findFirst({
      where: {
        OR: [
          { id: collegeId },
          { name: { equals: normalizedOldName, mode: 'insensitive' } },
          { id: `col-${normalizedOldName.toLowerCase().replace(/[^a-z0-9]+/g, "")}` }
        ]
      }
    });

    if (foundCol) {
      await tx.colleges.update({
        where: { id: foundCol.id },
        data: { 
          name: normalizedNewName, 
          updatedAt: new Date() 
        }
      });
    }

    // 2. Identify all possible identifier strings that may have referenced this college
    const matchKeys = Array.from(
      new Set([
        collegeId,
        foundCol?.id,
        normalizedOldName,
        normalizedOldName.toLowerCase(),
        `col-${normalizedOldName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`
      ].filter(Boolean))
    );

    const targetCollegeId = foundCol?.id || collegeId;

    // Update students referencing either the college ID or the old name
    await tx.students.updateMany({
      where: { collegeId: { in: matchKeys } },
      data: { collegeId: targetCollegeId, updatedAt: new Date() }
    });

    await tx.users.updateMany({
      where: { collegeId: { in: matchKeys } },
      data: { collegeId: targetCollegeId, updatedAt: new Date() }
    });

    await tx.exams.updateMany({
      where: { collegeId: { in: matchKeys } },
      data: { collegeId: targetCollegeId, updatedAt: new Date() }
    });

    await tx.resources.updateMany({
      where: { collegeId: { in: matchKeys } },
      data: { collegeId: targetCollegeId, updatedAt: new Date() }
    });
  });
}

export async function deleteDepartmentAndMigrateAction(
  collegeId: string,
  departmentName: string
) {
  await prisma.$transaction(async (tx: any) => {
    const college = await tx.colleges.findUnique({ where: { id: collegeId }, select: { departments: true } });
    if (college) {
      const departments = college.departments.filter((d: any) => d !== departmentName);
      await tx.colleges.update({
        where: { id: collegeId },
        data: { departments, updatedAt: new Date() }
      });
    }

    await tx.students.updateMany({
      where: { collegeId, department: departmentName },
      data: { department: "General", updatedAt: new Date() }
    });
  });
}

export async function renameDepartmentAndMigrateAction(
  collegeId: string,
  oldName: string,
  newName: string
) {
  await prisma.$transaction(async (tx: any) => {
    const college = await tx.colleges.findUnique({ where: { id: collegeId }, select: { departments: true } });
    if (college) {
      const departments = college.departments.map((d: any) => d === oldName ? newName : d);
      await tx.colleges.update({
        where: { id: collegeId },
        data: { departments, updatedAt: new Date() }
      });
    }

    await tx.students.updateMany({
      where: { collegeId, department: oldName },
      data: { department: newName, updatedAt: new Date() }
    });
  });
}
