import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  setDocument,
  deleteDocument,
  subscribeToDocuments,
  where,
} from "@/lib/firebase/firestore";
import { auth } from "@/lib/firebase/config";
import type { Student } from "@/types";

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

  let adminIdToken: string;
  try {
    adminIdToken = await currentUser.getIdToken();
  } catch {
    throw new Error("Failed to retrieve admin session token. Please sign in again.");
  }

  const response = await fetch("/api/admin/create-student-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminIdToken,
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      collegeId: input.collegeId.trim(),
      collegeName: input.collegeName.trim(),
      department: input.department.trim(),
      academicYear: input.academicYear.trim(),
      section: input.section.trim(),
      batch: input.batch.trim(),
    }),
  });

  let body: any = {};
  let rawText = "";
  try {
    const text = await response.text();
    rawText = text;
    body = JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse response as JSON. Raw response:", rawText);
  }

  if (!response.ok) {
    throw new Error(body.error || `Failed to create student account (${response.status}). ${rawText ? "Raw: " + rawText.slice(0, 100) : ""}`);
  }

  return {
    uid: body.uid,
    email: body.email,
    initialPassword: body.initialPassword,
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
  // We return an array of 1 student to match the signature expected by the cache
  return subscribeToDocuments<Student>(COLLECTION_NAME, callback, [where("id", "==", studentId)]);
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
