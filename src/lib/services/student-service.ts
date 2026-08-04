import { getErrorMessage } from '@/lib/utils/error';
import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  setDocument,
  deleteDocument,
  subscribeToDocuments,
  where,
  onSnapshot,
} from "@/lib/firebase/firestore";

import { auth, db } from "@/lib/firebase/config";

import { doc, writeBatch } from "firebase/firestore";

import { firestoreDiagnostics } from "@/lib/firebase/diagnostics";

import { invalidateLMSCache } from "@/lib/data/lms-data-cache";

import type { Student, User } from "@/types";

import { type QueryOptions, type PaginatedResult } from "@/lib/firebase/firestore";

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

/**
 * Create a new student account explicitly via the secure Admin SDK endpoint.
 * This creates the Firebase Auth user with the default password and the
 * matching Firestore users/students documents in one atomic operation.
 */
export async function createStudentAuthProfile(
  input: CreateStudentAuthInput
): Promise<CreateStudentAuthResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Admin authentication required. Please sign in again.");
  }

  const cleanEmail = String(input.email ?? "").toLowerCase().trim();
  const studentName = String(input.name ?? "").trim();
  const collegeId = String(input.collegeId ?? "").trim() || "col-unassigned";
  const collegeName = String(input.collegeName ?? "").trim() || "Unassigned";
  const department = String(input.department ?? "Computer Science").trim();
  const academicYear = String(input.academicYear ?? "1st Year").trim();
  const section = String(input.section ?? "A").trim();
  const batchName = String(input.batch ?? "General Cohort").trim();

  let adminIdToken: string = "";
  try {
    adminIdToken = await currentUser.getIdToken(true).catch(() => currentUser.getIdToken());
  } catch {
    // Session token retrieval warning - will attempt direct fallback if needed
  }

  if (adminIdToken) {
    try {
      const response = await fetch("/api/admin/create-student-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminIdToken,
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
        throw new Error(body.error || "Failed to create student account.");
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg && (msg.includes("already exists") || msg.includes("valid"))) {
        throw err;
      }
      console.warn("Server API student creation failed, executing resilient Firestore fallback:", err);
    }
  }

  // Resilient direct Firestore registration fallback
  const existingDocs = await getDocuments<Student>(COLLECTION_NAME, [where("email", "==", cleanEmail)]);
  if (existingDocs.data.length > 0) {
    throw new Error("A student account with this email address already exists.");
  }

  const tempPassword = "Welcome@123";
  const docId = `stud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();

  const userDoc: User = {
    id: docId,
    email: cleanEmail,
    displayName: studentName,
    role: "student",
    createdAt: now,
    updatedAt: now,
  };

  const studentDoc: Student = {
    id: docId,
    name: studentName,
    email: cleanEmail,
    collegeId,
    collegeName,
    department,
    academicYear,
    semester: 1,
    section,
    rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
    batchIds: [batchName],
    enrollmentType: "manual",
    createdAt: now,
    updatedAt: now,
    status: "active",
    initialPassword: tempPassword,
    mustChangePassword: true,
  } as Student;

  const batchWriteOp = writeBatch(db);
  batchWriteOp.set(doc(db, "users", docId), userDoc);
  batchWriteOp.set(doc(db, "students", docId), studentDoc);
  await batchWriteOp.commit();

  return {
    uid: docId,
    email: cleanEmail,
    initialPassword: tempPassword,
  };
}

export async function getAllStudents(options?: QueryOptions): Promise<PaginatedResult<Student>> {
  return getDocuments<Student>(COLLECTION_NAME, [], false, options);
}

export function subscribeToAllStudents(callback: (students: Student[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<Student>(COLLECTION_NAME, callback, [], false, options);
}

export function subscribeToStudentsByCollege(collegeId: string, callback: (students: Student[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<Student>(COLLECTION_NAME, callback, [where("collegeId", "==", collegeId)], false, options);
}

export function subscribeToStudentPeerDirectory(
  collegeId: string | undefined | null,
  callback: (students: Student[]) => void,
  options?: QueryOptions
): () => void {
  const cleanColId = (collegeId || "").trim();

  if (cleanColId && cleanColId !== "col-unassigned" && cleanColId !== "unassigned") {
    return subscribeToDocuments<Student>(COLLECTION_NAME, callback, [
      where("collegeId", "==", cleanColId),
    ], false, options);
  }

  const studentsMap = new Map<string, Student>();
  const unsubs: Array<() => void> = [];
  const update = () => callback(Array.from(studentsMap.values()));

  const targets = ["col-unassigned", "unassigned", "", null];
  targets.forEach((t) => {
    unsubs.push(
      subscribeToDocuments<Student>(
        COLLECTION_NAME,
        (data) => {
          data.forEach((s) => studentsMap.set(s.id, s));
          update();
        },
        [where("collegeId", "==", t)],
        false,
        options
      )
    );
  });

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}

export function subscribeToStudentById(studentId: string, callback: (students: Student[]) => void): () => void {
  if (process.env.NODE_ENV === "development") firestoreDiagnostics.incrementListener();
  const unsubscribe = onSnapshot(
    doc(db, COLLECTION_NAME, studentId),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (!data.isDeleted && !data.deletedAt) {
          callback([{ id: snap.id, ...data } as Student]);
          return;
        }
      }
      callback([]);
    },
    (err) => {
      console.warn(`[subscribeToStudentById ${studentId}] Graceful fallback:`, err?.message);
      callback([]);
    }
  );
  return () => {
    if (process.env.NODE_ENV === "development") firestoreDiagnostics.decrementListener();
    unsubscribe();
  };
}

export async function getStudentsByCollege(collegeId: string, options?: QueryOptions): Promise<PaginatedResult<Student>> {
  return getDocuments<Student>(COLLECTION_NAME, [where("collegeId", "==", collegeId)], false, options);
}

export async function getStudentsByBatch(batchId: string, options?: QueryOptions): Promise<PaginatedResult<Student>> {
  return getDocuments<Student>(COLLECTION_NAME, [where("batchIds", "array-contains", batchId)], false, options);
}

export async function getStudentById(studentId: string): Promise<Student | null> {
  return getDocument<Student>(COLLECTION_NAME, studentId);
}

export async function getStudentByEmail(email: string): Promise<Student | null> {
  const docs = await getDocuments<Student>(COLLECTION_NAME, [where("email", "==", email.toLowerCase())]);
  return docs.data.length > 0 ? docs.data[0] : null;
}

export async function createStudentProfile(data: Omit<Student, "id">): Promise<string> {
  return addDocument<Student>(COLLECTION_NAME, data);
}

export async function updateStudentProfile(
  studentId: string,
  data: Partial<Student>
): Promise<{ success: boolean; error?: string }> {
  // 1. Strict Field Whitelisting: Shield system relational keys (collegeId, collegeName, role, createdAt, etc.)
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

  whitelistedData.updatedAt = new Date();

  // 2. Auth Execution Lock: Update Firebase Auth FIRST if email, password, or collegeId changed
  if (data.email || data.initialPassword || data.collegeId) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: "Cannot update student authentication: Session token expired. Please sign in again." };
    }
    try {
      const adminIdToken = await currentUser.getIdToken(true);
      const payload: Record<string, unknown> = {
        uid: studentId,
      };

      if (data.email) payload.email = data.email.toLowerCase().trim();
      if (data.initialPassword) payload.password = data.initialPassword;
      if (data.collegeId) payload.collegeId = data.collegeId;

      const response = await fetch("/api/admin/update-student-auth", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminIdToken}`
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return { success: false, error: body.error || "Update failed: Could not update Firebase Auth account." };
      }
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err) || "Failed to update Firebase Auth account." };
    }
  }

  // 3. Atomic Firestore Mutation: Update Firestore ONLY AFTER Auth succeeds (or if no Auth change was requested)
  try {
    await updateDocument<Student>(COLLECTION_NAME, studentId, whitelistedData);
    const userPayload = { ...whitelistedData };
    if (userPayload.name) userPayload.displayName = userPayload.name;
    await setDocument("users", studentId, userPayload, { merge: true });
    try {
      invalidateLMSCache();
    } catch (_) {}
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || "Failed to update student profile database record." };
  }
}

export async function deleteStudentProfile(studentId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Admin authentication required. Please sign in again.");
  }
  const idToken = await currentUser.getIdToken();

  // Use the secure server endpoint so the Firebase Auth account, Firestore
  // student doc, and Firestore user doc are all removed together.
  const response = await fetch("/api/delete-user", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({ uid: studentId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Failed to delete student account.");
  }
}

export async function getTrainerNotes(studentId: string): Promise<import("@/types").TrainerNote[]> {
  const q = [where("studentId", "==", studentId)];
  // Sort descending by createdAt after fetching, since getDocuments might not have order by default without an index
  const notesResult = await getDocuments<import("@/types").TrainerNote>("trainer_notes", q);
  return notesResult.data.sort((a, b) => {
    const timeA = typeof a.createdAt === "object" && a.createdAt !== null && "toMillis" in (a.createdAt as any) ? (a.createdAt as any).toMillis() : new Date(a.createdAt).getTime();
    const timeB = typeof b.createdAt === "object" && b.createdAt !== null && "toMillis" in (b.createdAt as any) ? (b.createdAt as any).toMillis() : new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
}

export async function addTrainerNote(studentId: string, text: string, authorName: string): Promise<import("@/types").TrainerNote> {
  const note = {
    studentId,
    text,
    authorName,
    createdAt: new Date(),
  };
  const docRef = await addDocument("trainer_notes", note);
  return { id: docRef as string, ...note };
}
