"use server";

import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function updateStudentSettingsAction(id: string, data: any) {
  // Whitelist only valid student fields
  const cleanData: any = {};
  if (data.phone !== undefined) cleanData.phone = data.phone;
  if (data.department !== undefined) cleanData.department = data.department;
  if (data.academicYear !== undefined) cleanData.academicYear = data.academicYear;
  if (data.semester !== undefined) cleanData.semester = data.semester;
  if (data.section !== undefined) cleanData.section = data.section;
  if (data.rollNumber !== undefined) cleanData.rollNumber = data.rollNumber;
  if (data.enrollmentNo !== undefined) cleanData.enrollmentNo = data.enrollmentNo;
  if (data.mustChangePassword !== undefined) cleanData.mustChangePassword = data.mustChangePassword;
  if (data.enrollmentType !== undefined) cleanData.enrollmentType = data.enrollmentType;
  if (data.collegeId !== undefined) cleanData.collegeId = data.collegeId;
  if (data.updatedAt !== undefined) cleanData.updatedAt = data.updatedAt;
  return await prisma.students.update({ where: { id }, data: cleanData });
}

export async function updateUserSettingsAction(id: string, data: any) {
  // Whitelist only valid user fields
  const cleanData: any = {};
  if (data.email !== undefined) cleanData.email = data.email;
  if (data.displayName !== undefined) cleanData.displayName = data.displayName;
  if (data.role !== undefined) cleanData.role = data.role;
  if (data.collegeId !== undefined) cleanData.collegeId = data.collegeId;
  if (data.status !== undefined) cleanData.status = data.status;
  if (data.updatedAt !== undefined) cleanData.updatedAt = data.updatedAt;
  return await prisma.users.update({ where: { id }, data: cleanData });
}

export async function syncExamResultsNameAction(studentId: string, studentName: string) {
  // studentName field doesn't exist on exam_results in Prisma schema. It relies on the students/users relation.
  // We can just ignore this.
  return;
}

export async function getStudentsByEmailAction(email: string) {
  return await prisma.students.findMany({ where: { users: { email } }, select: { id: true } });
}

export async function getUsersByEmailAction(email: string) {
  return await prisma.users.findMany({ where: { email }, select: { id: true } });
}

export async function deleteStudentByIdAction(id: string) {
  const student = await prisma.students.findUnique({ where: { id }, select: { authId: true, id: true } });
  if (student) {
    const authId = student.authId || student.id;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId)) {
      await supabaseAdmin.auth.admin.deleteUser(authId).catch(console.error);
    }
  }
  return await prisma.students.delete({ where: { id } });
}

export async function deleteUserByIdAction(id: string) {
  const user = await prisma.users.findUnique({ where: { id }, select: { authId: true, id: true } });
  if (user) {
    const authId = user.authId || user.id;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId)) {
      await supabaseAdmin.auth.admin.deleteUser(authId).catch(console.error);
    }
  }
  return await prisma.users.delete({ where: { id } });
}

export async function updateCollegeSettingsAction(id: string, data: any) {
  // Whitelist only valid college fields
  const { initialPassword, loginEnabled, ...rest } = data;
  const cleanData: any = {};
  if (rest.name !== undefined) cleanData.name = rest.name;
  if (rest.type !== undefined) cleanData.type = rest.type;
  if (rest.code !== undefined) cleanData.code = rest.code;
  if (rest.departments !== undefined) cleanData.departments = rest.departments;
  if (rest.location !== undefined) cleanData.location = rest.location;
  if (rest.studentCount !== undefined) cleanData.studentCount = rest.studentCount;
  if (rest.adminEmail !== undefined) cleanData.adminEmail = rest.adminEmail;
  if (rest.status !== undefined) cleanData.status = rest.status;
  if (rest.branding !== undefined) cleanData.branding = rest.branding;
  if (rest.origin !== undefined) cleanData.origin = rest.origin;
  if (rest.updatedAt !== undefined) cleanData.updatedAt = rest.updatedAt;
  return await prisma.colleges.update({ where: { id }, data: cleanData });
}
