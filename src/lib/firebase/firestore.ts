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

export interface QueryOptions {
  pageSize?: number;
  lastDoc?: DocumentSnapshot | null;
}

/**
 * Safely maps a Firestore document snapshot to a strongly typed entity T.
 */
export const mapDoc = <T>(doc: DocumentSnapshot<DocumentData>): T => {
  if (!doc.exists()) {
    throw new Error(`Document with ID ${doc.id} does not exist.`);
  }
  return {
    id: doc.id,
    ...doc.data(),
  } as T;
};

/**
 * Safely maps an array of Firestore document snapshots.
 */
export const mapDocs = <T>(docs: DocumentSnapshot<DocumentData>[]): T[] => {
  return docs.filter(doc => doc.exists()).map((doc) => mapDoc<T>(doc));
};

export async function getDocument<T extends DocumentData>(
  collectionName: string,
  documentId: string
): Promise<T | null> {
  const docRef = doc(db, collectionName, documentId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return mapDoc<T>(docSnap);
  }
  return null;
}

export interface PaginatedResult<T> {
  data: T[];
  lastDoc: DocumentSnapshot | null;
}

export async function getDocuments<T extends DocumentData & { isDeleted?: boolean; deletedAt?: Date; status?: string }>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  includeDeleted: boolean = false,
  options?: QueryOptions
): Promise<PaginatedResult<T>> {
  const hasLimit = constraints.some((c) => c.type === 'limit');
  
  // OPTIMIZATION: Apply safe default limit if not specified to prevent unbounded reads
  const safePageSize = options?.pageSize || (hasLimit ? undefined : 1000);
  
  const finalConstraints = safePageSize && !hasLimit
    ? [...constraints, limit(safePageSize)]
    : [...constraints];
  
  if (options?.lastDoc) {
    // Note: To use startAfter, there must be a matching orderBy. If not provided in constraints, it assumes doc ID order or an existing orderBy.
    finalConstraints.push(startAfter(options.lastDoc));
  }
  
  const q = query(collection(db, collectionName), ...finalConstraints);
  const querySnapshot = await getDocs(q);
  const mapped = mapDocs<T>(querySnapshot.docs);
  
  return {
    data: mapped.filter((d) => includeDeleted || (!d.isDeleted && !d.deletedAt && d.status !== "deleted")),
    lastDoc: querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null
  };
}

/**
 * Safely strips undefined values from plain objects and arrays recursively
 * without altering Firestore sentinels (FieldValue, Timestamp, Date, etc.)
 */
export function sanitizeFirestoreData(data: unknown): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== "object") return data;
  if (data instanceof Date) return data;
  if (Array.isArray(data)) {
    return data
      .map((item) => sanitizeFirestoreData(item))
      .filter((item) => item !== undefined && item !== null);
  }
  // If it's not a plain object (e.g. Firestore Timestamp, FieldValue, serverTimestamp sentinel), return as is
  if (data && typeof data === 'object' && data.constructor && data.constructor.name !== "Object" && Object.getPrototypeOf(data) !== null) {
    return data;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
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

export async function getPaginatedDocuments<T extends DocumentData & { isDeleted?: boolean; deletedAt?: Date; status?: string }>(
  collectionName: string,
  pageSize: number,
  lastDoc?: DocumentSnapshot,
  constraints: QueryConstraint[] = [],
  includeDeleted: boolean = false
): Promise<{ data: T[]; lastDoc: DocumentSnapshot | null }> {
  const baseConstraints = [...constraints, orderBy("createdAt", "desc"), limit(pageSize)];
  if (lastDoc) {
    baseConstraints.push(startAfter(lastDoc));
  }
  const q = query(collection(db, collectionName), ...baseConstraints);
  const querySnapshot = await getDocs(q);
  const mapped = mapDocs<T>(querySnapshot.docs);
  const data = mapped.filter((d) => includeDeleted || (!d.isDeleted && !d.deletedAt && d.status !== "deleted"));
  const last = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
  return { data, lastDoc: last };
}

export function subscribeToDocuments<T extends DocumentData & { isDeleted?: boolean; deletedAt?: Date; status?: string }>(
  collectionName: string,
  callback: (data: T[]) => void,
  constraints: QueryConstraint[] = [],
  includeDeleted: boolean = false,
  options?: QueryOptions
): () => void {
  const hasLimit = constraints.some((c) => c.type === 'limit');
  
  // OPTIMIZATION: Apply safe default limit if not specified to prevent unbounded live subscriptions
  const safePageSize = options?.pageSize || (hasLimit ? undefined : 1000);
  
  const finalConstraints = safePageSize && !hasLimit
    ? [...constraints, limit(safePageSize)]
    : constraints;
  
  const q = query(collection(db, collectionName), ...finalConstraints);
  return onSnapshot(
    q,
    (snapshot) => {
      const mapped = mapDocs<T>(snapshot.docs);
      const data = mapped.filter((d) => includeDeleted || (!d.isDeleted && !d.deletedAt && d.status !== "deleted"));
      callback(data);
    },
    (error) => {
      console.warn(`[Firestore Listener ${collectionName}] Error:`, error?.message);
      callback([]);
    }
  );
}

export { where, orderBy, limit, collection, doc, query, setDoc, writeBatch, onSnapshot, getDoc, serverTimestamp };
