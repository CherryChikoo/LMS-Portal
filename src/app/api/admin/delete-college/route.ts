import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { id, adminIdToken } = await request.json();

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "College ID is required." }, { status: 400 });
    }

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    // Initialize App and Auth
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists || requesterDoc.data()?.role !== "admin") {
      return NextResponse.json({ error: "Only global admins can delete colleges." }, { status: 403 });
    }

    // 1. Fetch college document details first before deletion
    const collegeRef = db.collection("colleges").doc(id);
    const collegeUserDocRef = db.collection("users").doc(id);
    const collegeDoc = await collegeRef.get();
    const collegeName = collegeDoc.exists ? collegeDoc.data()?.name : "";

    // 2. Delete college document FIRST so Firestore snapshot updates immediately
    const initialBatch = db.batch();
    initialBatch.delete(collegeRef);
    initialBatch.delete(collegeUserDocRef);
    await initialBatch.commit().catch(() => {});

    // 3. Fetch all associated students (by collegeId AND collegeName) and departments in parallel
    const [studentsByIdSnap, studentsByNameSnap, departmentsSnap] = await Promise.all([
      db.collection("students").where("collegeId", "==", id).get(),
      collegeName ? db.collection("students").where("collegeName", "==", collegeName).get() : Promise.resolve({ docs: [] }),
      db.collection("departments").where("collegeId", "==", id).get(),
    ]);

    const studentDocsMap = new Map();
    studentsByIdSnap.docs.forEach((d) => studentDocsMap.set(d.id, d));
    if (studentsByNameSnap && "docs" in studentsByNameSnap) {
      studentsByNameSnap.docs.forEach((d: any) => studentDocsMap.set(d.id, d));
    }

    const studentDocs = Array.from(studentDocsMap.values());
    const studentIds = studentDocs.map((d) => d.id);

    // 4. Delete student Auth accounts concurrently in parallel
    const authDeletions = studentIds.map((studentId) =>
      auth.deleteUser(studentId).catch((err: any) => {
        if (err?.code !== "auth/user-not-found") {
          console.error(`Auth deletion error for student ${studentId}:`, err);
        }
      })
    );
    authDeletions.push(auth.deleteUser(id).catch(() => {}));

    // 5. Batch delete student docs, user docs, and department docs
    const deleteBatch = db.batch();
    for (const doc of studentDocs) {
      deleteBatch.delete(doc.ref);
      deleteBatch.delete(db.collection("users").doc(doc.id));
    }
    for (const doc of departmentsSnap.docs) {
      deleteBatch.delete(doc.ref);
    }

    // Execute Auth cleanup and Firestore batch cleanup in parallel
    await Promise.all([
      Promise.allSettled(authDeletions),
      deleteBatch.commit().catch(() => {}),
    ]);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Delete college endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: (err as Error)?.message || String(err) },
      { status: 500 }
    );
  }
}
