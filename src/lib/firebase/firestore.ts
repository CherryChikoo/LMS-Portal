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
  return querySnapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as unknown as T)
  );
}

export async function addDocument<T extends DocumentData>(
  collectionName: string,
  data: Omit<T, "id">
): Promise<string> {
  const docRef = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateDocument<T extends DocumentData>(
  collectionName: string,
  documentId: string,
  data: Partial<T>
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
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
  const data = querySnapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() } as unknown as T)
  );
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
    const data = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as unknown as T)
    );
    callback(data);
  });
}

export { where, orderBy, limit, collection, doc, query, setDoc, writeBatch, onSnapshot };
