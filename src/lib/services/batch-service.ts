import { db } from "@/lib/firebase/config";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { getDocuments, subscribeToDocuments } from "@/lib/firebase/firestore";
import type { Batch } from "@/types";

/**
 * Get all batches
 */
export async function getAllBatches(): Promise<Batch[]> {
  return getDocuments<Batch>("batches", [orderBy("createdAt", "desc")]);
}

/**
 * Subscribe to all batches
 */
export function subscribeToAllBatches(callback: (batches: Batch[]) => void): () => void {
  return subscribeToDocuments<Batch>("batches", callback, [orderBy("createdAt", "desc")]);
}

/**
 * Get batch by ID
 */
export async function getBatchById(id: string): Promise<Batch | null> {
  const docRef = doc(db, "batches", id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as Batch;
}

/**
 * Get batches by college
 */
export async function getBatchesByCollege(collegeId: string): Promise<Batch[]> {
  return getDocuments<Batch>("batches", [
    where("collegeId", "==", collegeId),
    orderBy("createdAt", "desc")
  ]);
}

/**
 * Subscribe to batches by college
 */
export function subscribeToBatchesByCollege(
  collegeId: string,
  callback: (batches: Batch[]) => void
): () => void {
  return subscribeToDocuments<Batch>("batches", callback, [
    where("collegeId", "==", collegeId),
    orderBy("createdAt", "desc")
  ]);
}

/**
 * Create a new batch
 */
export async function createBatch(data: Partial<Batch>): Promise<string> {
  const now = Timestamp.now();

  const batchData = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(db, "batches"), batchData);
  return docRef.id;
}

/**
 * Update a batch
 */
export async function updateBatch(
  id: string,
  data: Partial<Batch>
): Promise<void> {
  const docRef = doc(db, "batches", id);

  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Delete a batch
 */
export async function deleteBatch(id: string): Promise<void> {
  const docRef = doc(db, "batches", id);
  await deleteDoc(docRef);
}
