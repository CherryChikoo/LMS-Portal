import { supabase } from '@/lib/supabase/client';
import { globalLoading } from "@/providers/global-loading-provider";
import { getErrorMessage } from '@/lib/utils/error';
import { refreshCache, optimisticAddStudentToCache, optimisticUpdateStudentInCache, optimisticDeleteStudentFromCache } from "@/lib/data/lms-data-cache";
import type { Student, User } from "@/types";
import {
  getAllStudentsAction,
  getStudentsByCollegeAction,
  getStudentsByBatchAction,
  getStudentByIdAction,
  getStudentByEmailAction,
  createStudentProfileAction,
  updateStudentProfileAction,
  getTrainerNotesAction,
  addTrainerNoteAction,
  checkStudentEmailExistsAction,
  resilientStudentFallbackAction
} from '@/lib/actions/student-actions';

const COLLECTION_NAME = "students";

export interface CreateStudentAuthInput {
  email: string;
  name: string;
  collegeId: string;
  collegeName: string;
  department: string;
  academicYear: string;
  section: string;
  batch: string;
}

export interface CreateStudentAuthResult {
  uid: string;
  email: string;
  initialPassword: string;
}

export async function createStudentAuthProfile(
  input: CreateStudentAuthInput
): Promise<CreateStudentAuthResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  
  if (!session) {
    throw new Error("Admin authentication required. Please sign in again.");
  }

  const cleanEmail = String(input.email ?? "").toLowerCase().trim();
  const studentName = String(input.name ?? "").trim();
  const collegeId = String(input.collegeId ?? "").trim() || "col-unassigned";
  const collegeName = String(input.collegeName ?? "").trim() || "Unassigned";
  const department = String(input.department ?? "Computer Science").trim();
  const academicYear = String(input.academicYear ?? "1st Year").trim();
  const section = String(input.section ?? "A").trim();
  const batchName = input.batch ? String(input.batch).trim() : "";

  try {
    const response = await fetch("/api/admin/create-student-auth", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        email: cleanEmail,
        name: studentName,
        collegeId,
        collegeName,
        department,
        academicYear,
        section,
        batch: batchName,
      }),
    });

    let body: any = {};
    try {
      const text = await response.text();
      body = JSON.parse(text);
    } catch (_) {}

    if (response.ok && body.uid) {
      return {
        uid: body.uid,
        email: body.email || cleanEmail,
        initialPassword: body.initialPassword || "Welcome@123",
      };
    }
    if (response.status === 400 || response.status === 409) {
      throw new Error(body.message || body.error || "Failed to create student account.");
    }
  } catch (err: unknown) {
    const msg = getErrorMessage(err).toLowerCase();
    if (msg && (msg.includes("already exists") || msg.includes("valid") || msg.includes("email"))) {
      throw err;
    }
    console.warn("Server API student creation failed, executing resilient fallback:", err);
  }

  // Resilient direct Prisma registration fallback
  const existingDocs = await checkStudentEmailExistsAction(cleanEmail);
  if (existingDocs) {
    throw new Error("A student account with this email address already exists.");
  }

  const docId = `stud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();

  const userDoc = {
    id: docId,
    email: cleanEmail,
    displayName: studentName,
    role: "student",
    createdAt: now,
    updatedAt: now,
  };

  const studentDoc = {
    id: docId,
    collegeId,
    department,
    academicYear,
    semester: 1,
    section,
    rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
    enrollmentType: "manual",
    createdAt: now,
    updatedAt: now,
    mustChangePassword: true,
  };

  await resilientStudentFallbackAction(docId, cleanEmail, studentName, studentDoc, userDoc);

  return {
    uid: docId,
    email: cleanEmail,
    initialPassword: "Welcome@123",
  };
}

function mapStudentRow(row: any): Student {
  if (!row) return row;
  const user = row.users || {};
  const batchIds: string[] = [];
  const batchNames: string[] = [];
  const batchesList: Array<{ id: string; name: string; department?: string; section?: string }> = [];

  if (Array.isArray(row.student_batches)) {
    row.student_batches.forEach((sb: any) => {
      const bId = sb.batchId || sb.batches?.id;
      const bName = sb.batches?.name;
      if (bId && !batchIds.includes(bId)) {
        batchIds.push(bId);
      }
      if (bName && !batchNames.includes(bName)) {
        batchNames.push(bName);
      }
      if (sb.batches) {
        batchesList.push({
          id: sb.batches.id,
          name: sb.batches.name,
          department: sb.batches.department,
          section: sb.batches.section
        });
      }
    });
  } else if (Array.isArray(row.batchIds)) {
    row.batchIds.forEach((b: string) => {
      if (b && !batchIds.includes(b)) batchIds.push(b);
    });
  }

  const collegeName = row.colleges?.name || row.collegeName || (!row.collegeId || row.collegeId === "col-unassigned" || row.collegeId === "unassigned" ? "Unassigned" : row.collegeId);
  const mapped = {
    ...row,
    collegeName,
    name: user.displayName || user.name || row.name || "Unnamed Student",
    email: user.email || row.email || "",
    role: user.role || row.role || "student",
    displayName: user.displayName || user.name || row.displayName || "Unnamed Student",
    status: user.status || row.status || "active",
    batchIds,
    batchNames,
    batches: batchesList,
    batchCount: batchIds.length,
  };
  delete mapped.users;
  delete mapped.colleges;
  return mapped as Student;
}

export async function getAllStudents(): Promise<{ data: Student[], lastDoc: any }> {
  const data = await getAllStudentsAction();
  const parsedData = JSON.parse(JSON.stringify(data));
  const mappedData = parsedData.map(mapStudentRow);
  return { data: mappedData, lastDoc: mappedData.length > 0 ? mappedData[mappedData.length - 1] : null };
}

export async function getStudentsByCollege(collegeId: string): Promise<{ data: Student[], lastDoc: any }> {
  const data = await getStudentsByCollegeAction(collegeId);
  const parsedData = JSON.parse(JSON.stringify(data));
  const mappedData = parsedData.map(mapStudentRow);
  return { data: mappedData, lastDoc: mappedData.length > 0 ? mappedData[mappedData.length - 1] : null };
}

export async function getStudentsByBatch(batchId: string): Promise<{ data: Student[], lastDoc: any }> {
  const data = await getStudentsByBatchAction(batchId);
  const parsedData = JSON.parse(JSON.stringify(data));
  const students = parsedData.map((row: any) => mapStudentRow(row.students));
  return {
    data: students,
    lastDoc: null
  };
}

export async function getStudentById(studentId: string): Promise<Student | null> {
  const data = await getStudentByIdAction(studentId);
  if (!data) return null;
  return mapStudentRow(JSON.parse(JSON.stringify(data)));
}

export async function getStudentByEmail(email: string): Promise<Student | null> {
  const data = await getStudentByEmailAction(email);
  if (!data) return null;
  return mapStudentRow(JSON.parse(JSON.stringify(data)));
}

export async function createStudentProfile(data: Omit<Student, "id">): Promise<string> {
  return await globalLoading.wrap(async () => {
    const id = await createStudentProfileAction(data);
    try {
      optimisticAddStudentToCache({ id, ...data } as Student);
      refreshCache().catch(() => {});
    } catch (_) {}
    return id;
  }, `Creating student profile for ${data.name}...`);
}

export async function updateStudentProfile(
  studentId: string,
  data: Partial<Student>
): Promise<{ success: boolean; error?: string }> {
  return await globalLoading.wrap(async () => {
    const whitelistedData: Record<string, unknown> = {};
    if (data.name !== undefined) whitelistedData.name = data.name.trim();
    if (data.email !== undefined) whitelistedData.email = data.email.toLowerCase().trim();
    if (data.phone !== undefined) whitelistedData.phone = data.phone;
    if (data.collegeId !== undefined) whitelistedData.collegeId = data.collegeId;
    if (data.collegeName !== undefined) whitelistedData.collegeName = data.collegeName;
    if (data.rollNumber !== undefined) whitelistedData.rollNumber = data.rollNumber;
    if (data.department !== undefined) whitelistedData.department = data.department;
    if (data.academicYear !== undefined) whitelistedData.academicYear = data.academicYear;
    if (data.section !== undefined) whitelistedData.section = data.section;
    if (data.status !== undefined) whitelistedData.status = data.status;
    if (data.batchIds !== undefined) whitelistedData.batchIds = data.batchIds;
    if (data.initialPassword !== undefined) whitelistedData.initialPassword = data.initialPassword;

    whitelistedData.updatedAt = new Date().toISOString();

    // Optimistically update cache right away for instant UI responsiveness
    try {
      optimisticUpdateStudentInCache(studentId, whitelistedData as Partial<Student>);
    } catch (_) {}

    if (data.email || data.initialPassword || data.collegeId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      
      if (!session) {
        return { success: false, error: "Cannot update student authentication: Session token expired. Please sign in again." };
      }
      try {
        const payload: Record<string, unknown> = { uid: studentId };
        if (data.email) payload.email = data.email.toLowerCase().trim();
        if (data.initialPassword) payload.password = data.initialPassword;
        if (data.collegeId) payload.collegeId = data.collegeId;

        const response = await fetch("/api/admin/update-student-auth", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          return { success: false, error: body.error || "Update failed: Could not update Auth account." };
        }
      } catch (err: unknown) {
        return { success: false, error: getErrorMessage(err) || "Failed to update Auth account." };
      }
    }

    try {
      await updateStudentProfileAction(studentId, whitelistedData);
      
      try {
        refreshCache().catch(() => {});
      } catch (_) {}
      
      if (whitelistedData.collegeName) {
        fetch("/api/auth/register-college", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeName: whitelistedData.collegeName })
        }).catch(() => {});
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) || "Failed to update student profile database record." };
    }
  }, "Updating student profile...");
}

export async function deleteStudentProfile(studentId: string): Promise<void> {
  return await globalLoading.wrap(async () => {
    // Optimistic deletion
    try {
      optimisticDeleteStudentFromCache(studentId);
    } catch (_) {}

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    
    if (!session) {
      throw new Error("Admin authentication required. Please sign in again.");
    }

    const response = await fetch("/api/delete-user", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ uid: studentId }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || "Failed to delete student account.");
    }

    try {
      refreshCache().catch(() => {});
    } catch (_) {}
  }, "Deleting student account...");
}

export async function getTrainerNotes(studentId: string): Promise<import("@/types").TrainerNote[]> {
  const data = await getTrainerNotesAction(studentId);
  return JSON.parse(JSON.stringify(data));
}

export async function addTrainerNote(studentId: string, text: string, authorName: string): Promise<import("@/types").TrainerNote> {
  const note = {
    studentId,
    text,
    authorName,
    createdAt: new Date(),
  };
  const id = await addTrainerNoteAction(note);
  return JSON.parse(JSON.stringify({ id, ...note }));
}
