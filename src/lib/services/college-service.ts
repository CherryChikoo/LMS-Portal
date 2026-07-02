import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  subscribeToDocuments,
  where,
} from "@/lib/firebase/firestore";
import type { College, Batch } from "@/types";

const COLLEGE_COLLECTION = "colleges";
const BATCH_COLLECTION = "batches";

export async function getAllColleges(): Promise<College[]> {
  return getDocuments<College>(COLLEGE_COLLECTION);
}

export function subscribeToAllColleges(callback: (colleges: College[]) => void): () => void {
  return subscribeToDocuments<College>(COLLEGE_COLLECTION, callback);
}

export async function getCollegeById(id: string): Promise<College | null> {
  return getDocument<College>(COLLEGE_COLLECTION, id);
}

export async function createCollege(data: Omit<College, "id">): Promise<string> {
  return addDocument<College>(COLLEGE_COLLECTION, data);
}

export async function updateCollege(id: string, data: Partial<College>): Promise<void> {
  return updateDocument<College>(COLLEGE_COLLECTION, id, data);
}

export async function deleteCollege(id: string): Promise<void> {
  return deleteDocument(COLLEGE_COLLECTION, id);
}

// Batches
export async function getAllBatches(): Promise<Batch[]> {
  return getDocuments<Batch>(BATCH_COLLECTION);
}

export function subscribeToAllBatches(callback: (batches: Batch[]) => void): () => void {
  return subscribeToDocuments<Batch>(BATCH_COLLECTION, callback);
}

export async function getBatchById(id: string): Promise<Batch | null> {
  return getDocument<Batch>(BATCH_COLLECTION, id);
}

export async function getBatchesByCollege(collegeId: string): Promise<Batch[]> {
  return getDocuments<Batch>(BATCH_COLLECTION, [where("collegeId", "==", collegeId)]);
}

export async function createBatch(data: Omit<Batch, "id">): Promise<string> {
  return addDocument<Batch>(BATCH_COLLECTION, data);
}

export async function updateBatch(id: string, data: Partial<Batch>): Promise<void> {
  return updateDocument<Batch>(BATCH_COLLECTION, id, data);
}

export async function deleteBatch(id: string): Promise<void> {
  return deleteDocument(BATCH_COLLECTION, id);
}
