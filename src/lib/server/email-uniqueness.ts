import "server-only";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

export interface EmailLookupResult {
  normalizedEmail: string;
  userDocs: QueryDocumentSnapshot[];
  studentDocs: QueryDocumentSnapshot[];
  collegeDocs: QueryDocumentSnapshot[];
}

export interface EmailConflictOptions {
  excludeUserIds?: string[];
  excludeCollegeIds?: string[];
  limitPerCollection?: number;
}

export async function lookupEmailDocuments(
  db: Firestore,
  email: string,
  options?: { limitPerCollection?: number }
): Promise<EmailLookupResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const perCollectionLimit = Math.max(1, options?.limitPerCollection || 3);

  const [usersSnap, studentsSnap, collegesSnap] = await Promise.all([
    db.collection("users").where("email", "==", normalizedEmail).limit(perCollectionLimit).get(),
    db.collection("students").where("email", "==", normalizedEmail).limit(perCollectionLimit).get(),
    db.collection("colleges").where("adminEmail", "==", normalizedEmail).limit(perCollectionLimit).get(),
  ]);

  return {
    normalizedEmail,
    userDocs: usersSnap.docs,
    studentDocs: studentsSnap.docs,
    collegeDocs: collegesSnap.docs,
  };
}

export async function isEmailInUse(
  db: Firestore,
  email: string,
  options?: EmailConflictOptions
): Promise<boolean> {
  const excludedUsers = new Set((options?.excludeUserIds || []).filter(Boolean));
  const excludedColleges = new Set((options?.excludeCollegeIds || []).filter(Boolean));
  const docs = await lookupEmailDocuments(db, email, { limitPerCollection: options?.limitPerCollection });

  const usersConflict = docs.userDocs.some((doc) => !excludedUsers.has(doc.id));
  const studentsConflict = docs.studentDocs.some((doc) => !excludedUsers.has(doc.id));
  const collegesConflict = docs.collegeDocs.some((doc) => !excludedColleges.has(doc.id));

  return usersConflict || studentsConflict || collegesConflict;
}
