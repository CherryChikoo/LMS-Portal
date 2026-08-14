"use server";

import { prisma } from '@/lib/prisma';
import type { College } from "@/types";

export async function fetchCollegesAction() {
  const data = await prisma.colleges.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return data;
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
  return inserted.id;
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
  const { initialPassword, loginEnabled, ...validData } = updateData;
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
  await prisma.colleges.update({
    where: { id },
    data: { isDeleted: true, status: "deleted", updatedAt: new Date() }
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
  const normalizedNewName = newName.trim().toLowerCase();

  // Use Prisma transaction for atomicity!
  await prisma.$transaction(async (tx: any) => {
    // Update the college name
    if (!isExternal) {
      await tx.colleges.update({
        where: { id: collegeId },
        data: { name: normalizedNewName, updatedAt: new Date() }
      });
    }

    // For external colleges, we need to update collegeId references
    // For internal colleges, the collegeId stays the same — only the name changes
    if (isExternal) {
      // External: collegeId was the old name, update to new name
      await tx.students.updateMany({
        where: { collegeId },
        data: { collegeId: normalizedNewName, updatedAt: new Date() }
      });

      await tx.users.updateMany({
        where: { collegeId },
        data: { collegeId: normalizedNewName, updatedAt: new Date() }
      });

      await tx.exams.updateMany({
        where: { collegeId },
        data: { collegeId: normalizedNewName, updatedAt: new Date() }
      });

      await tx.resources.updateMany({
        where: { collegeId },
        data: { collegeId: normalizedNewName, updatedAt: new Date() }
      });
    }
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
