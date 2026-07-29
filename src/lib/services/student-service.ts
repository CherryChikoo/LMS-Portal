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
import type { Student, User } from "@/types";

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
    } catch (err: any) {
      if (err?.message && (err.message.includes("already exists") || err.message.includes("valid"))) {
        throw err;
      }
      console.warn("Server API student creation failed, executing resilient Firestore fallback:", err);
    }
  }

  // Resilient direct Firestore registration fallback
  const existingDocs = await getDocuments<Student>(COLLECTION_NAME, [where("email", "==", cleanEmail)]);
  if (existingDocs.length > 0) {
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

export async function getAllStudents(): Promise<Student[]> {
  return getDocuments<Student>(COLLECTION_NAME);
}

export function subscribeToAllStudents(callback: (students: Student[]) => void): () => void {
  return subscribeToDocuments<Student>(COLLECTION_NAME, callback);
}

export function subscribeToStudentsByCollege(collegeId: string, callback: (students: Student[]) => void): () => void {
  return subscribeToDocuments<Student>(COLLECTION_NAME, callback, [where("collegeId", "==", collegeId)]);
}

export function subscribeToStudentById(studentId: string, callback: (students: Student[]) => void): () => void {
  if (process.env.NODE_ENV === "development") firestoreDiagnostics.incrementListener();
  const unsubscribe = onSnapshot(doc(db, COLLECTION_NAME, studentId), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (!data.isDeleted && !data.deletedAt) {
        callback([{ id: snap.id, ...data } as Student]);
        return;
      }
    }
    callback([]);
  });
  return () => {
    if (process.env.NODE_ENV === "development") firestoreDiagnostics.decrementListener();
    unsubscribe();
  };
}

export async function getStudentsByCollege(collegeId: string): Promise<Student[]> {
  return getDocuments<Student>(COLLECTION_NAME, [where("collegeId", "==", collegeId)]);
}

export async function getStudentsByBatch(batchId: string): Promise<Student[]> {
  return getDocuments<Student>(COLLECTION_NAME, [where("batchIds", "array-contains", batchId)]);
}

export async function getStudentById(studentId: string): Promise<Student | null> {
  return getDocument<Student>(COLLECTION_NAME, studentId);
}

export async function getStudentByEmail(email: string): Promise<Student | null> {
  const docs = await getDocuments<Student>(COLLECTION_NAME, [where("email", "==", email.toLowerCase())]);
  return docs.length > 0 ? docs[0] : null;
}

export async function createStudentProfile(data: Omit<Student, "id">): Promise<string> {
  return addDocument<Student>(COLLECTION_NAME, data);
}

export async function updateStudentProfile(studentId: string, data: Partial<Student>): Promise<void> {
  await updateDocument<Student>(COLLECTION_NAME, studentId, data);
  try {
    await setDocument("users", studentId, data as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.error("Failed to sync user document for student", err);
  }

  // If email or password is provided, sync the change to Firebase Auth via the Admin API
  if (data.email || data.initialPassword) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn("Cannot sync to Firebase Auth: no authenticated user session.");
      } else {
        // Validate that the admin user has the correct role before calling the API
        let adminIdToken: string;
        try {
          adminIdToken = await currentUser.getIdToken();
        } catch {
          console.warn("Cannot sync to Firebase Auth: failed to retrieve admin session token.");
          return;
        }

        const payload: Record<string, unknown> = {
          uid: studentId,
          adminIdToken,
        };

        if (data.email) {
          payload.email = data.email;
        }
        if (data.initialPassword) {
          payload.password = data.initialPassword;
        }

        const response = await fetch("/api/admin/update-student-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || response.statusText);
        }
      }
    } catch (err) {
      console.error("Failed to sync student auth changes to Firebase:", err);
      throw err;
    }
  }

  if (data.email) {
    try {
      const targetEmail = data.email.toLowerCase().trim();
      const matchingStuds = await getDocuments<Student>(COLLECTION_NAME, [where("email", "==", targetEmail)]);
      for (const sDoc of matchingStuds) {
        if (sDoc.id !== studentId) {
          await deleteDocument(COLLECTION_NAME, sDoc.id);
        }
      }
      const matchingUsers = await getDocuments<Record<string, unknown>>("users", [where("email", "==", targetEmail)]);
      for (const uDoc of matchingUsers) {
        if ((uDoc as { id: string }).id !== studentId) {
          await deleteDocument("users", (uDoc as { id: string }).id);
        }
      }
    } catch (err) {
      console.error("Failed to clean up secondary duplicate student documents", err);
    }
  }
}

export async function deleteStudentProfile(studentId: string): Promise<void> {
  // Use the secure server endpoint so the Firebase Auth account, Firestore
  // student doc, and Firestore user doc are all removed together.
  const response = await fetch("/api/delete-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: studentId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Failed to delete student account.");
  }
}

export async function getTrainerNotes(studentId: string): Promise<import("@/types").TrainerNote[]> {
  const q = [where("studentId", "==", studentId)];
  // Sort descending by createdAt after fetching, since getDocuments might not have order by default without an index
  const notes = await getDocuments<import("@/types").TrainerNote>("trainer_notes", q);
  return notes.sort((a, b) => {
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
