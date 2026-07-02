import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  subscribeToDocuments,
  where,
} from "@/lib/firebase/firestore";
import type { Student, CSVStudentRow } from "@/types";

const COLLECTION_NAME = "students";

export async function getAllStudents(): Promise<Student[]> {
  return getDocuments<Student>(COLLECTION_NAME);
}

export function subscribeToAllStudents(callback: (students: Student[]) => void): () => void {
  return subscribeToDocuments<Student>(COLLECTION_NAME, callback);
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
    await updateDocument("users", studentId, data as Record<string, unknown>);
  } catch (err) {
    console.error("Failed to sync user document for student", err);
  }
}

export async function deleteStudentProfile(studentId: string): Promise<void> {
  await deleteDocument(COLLECTION_NAME, studentId);
  try {
    await deleteDocument("users", studentId);
  } catch (err) {
    console.error("Failed to delete user document for student", err);
  }
}
