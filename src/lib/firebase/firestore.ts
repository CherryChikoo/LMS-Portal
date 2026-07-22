import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type DocumentData,
  type QueryConstraint,
  type DocumentSnapshot,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./config";

export async function getDocument<T extends DocumentData>(
  collectionName: string,
  documentId: string
): Promise<T | null> {
  const docRef = doc(db, collectionName, documentId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as unknown as T;
  }
  return null;
}

export async function getDocuments<T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  const q = query(collection(db, collectionName), ...constraints);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as unknown as T))
    .filter((d: any) => !d.isDeleted && !d.deletedAt);
}

/**
 * Safely strips undefined values from plain objects and arrays recursively
 * without altering Firestore sentinels (FieldValue, Timestamp, Date, etc.)
 */
export function sanitizeFirestoreData(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== "object") return data;
  if (data instanceof Date) return data;
  if (Array.isArray(data)) {
    return data
      .map((item) => sanitizeFirestoreData(item))
      .filter((item) => item !== undefined && item !== null);
  }
  // If it's not a plain object (e.g. Firestore Timestamp, FieldValue, serverTimestamp sentinel), return as is
  if (data.constructor && data.constructor.name !== "Object" && Object.getPrototypeOf(data) !== null) {
    return data;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      result[key] = sanitizeFirestoreData(value);
    }
  }
  return result;
}

export async function addDocument<T extends DocumentData>(
  collectionName: string,
  data: Omit<T, "id">
): Promise<string> {
  const cleanData = sanitizeFirestoreData({
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const docRef = await addDoc(collection(db, collectionName), cleanData);
  return docRef.id;
}

export async function updateDocument<T extends DocumentData>(
  collectionName: string,
  documentId: string,
  data: Partial<T>
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  const cleanData = sanitizeFirestoreData({
    ...data,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(docRef, cleanData);
}

export async function setDocument<T extends DocumentData>(
  collectionName: string,
  documentId: string,
  data: Partial<T>,
  options: { merge?: boolean } = {}
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  const cleanData = sanitizeFirestoreData({
    ...data,
    updatedAt: serverTimestamp(),
  });
  await setDoc(docRef, cleanData, options);
}

export async function deleteDocument(
  collectionName: string,
  documentId: string
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  await deleteDoc(docRef);
}

export async function getPaginatedDocuments<T extends DocumentData>(
  collectionName: string,
  pageSize: number,
  lastDoc?: DocumentSnapshot,
  constraints: QueryConstraint[] = []
): Promise<{ data: T[]; lastDoc: DocumentSnapshot | null }> {
  const baseConstraints = [...constraints, orderBy("createdAt", "desc"), limit(pageSize)];
  if (lastDoc) {
    baseConstraints.push(startAfter(lastDoc));
  }
  const q = query(collection(db, collectionName), ...baseConstraints);
  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as unknown as T))
    .filter((d: any) => !d.isDeleted && !d.deletedAt);
  const last = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
  return { data, lastDoc: last };
}

export function subscribeToDocuments<T extends DocumentData>(
  collectionName: string,
  callback: (data: T[]) => void,
  constraints: QueryConstraint[] = []
): () => void {
  const q = query(collection(db, collectionName), ...constraints);
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as unknown as T))
      .filter((d: any) => !d.isDeleted && !d.deletedAt);
    callback(data);
  });
}

export { where, orderBy, limit, collection, doc, query, setDoc, writeBatch, onSnapshot, getDoc, serverTimestamp };
