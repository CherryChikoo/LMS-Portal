import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const body = await request.json().catch(() => ({}));
    const { id, collegeName: clientCollegeName, adminIdToken } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: "College ID is required." }, { status: 400 });
    }
    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ success: false, stage, errorCode: "auth/missing-token", message: "Admin authorization token is required." }, { status: 401 });
    }

    stage = "verifyAdminToken";
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err: any) {
      return NextResponse.json({ success: false, stage, errorCode: err?.code, message: "Invalid or expired admin session.", details: String(err) }, { status: 401 });
    }

    stage = "verifyAdminRole";
    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data()?.role : undefined;
    if (requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admin or trainer roles can delete colleges." }, { status: 403 });
    }

    stage = "fetchCollegeData";
    const collegeRef = db.collection("colleges").doc(id);
    const collegeUserDocRef = db.collection("users").doc(id);
    let collegeDoc;
    try {
      collegeDoc = await collegeRef.get();
    } catch (err: any) {
      console.error({ route: "/api/admin/delete-college", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
      return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message, retryable: true }, { status: 500 });
    }
    const collegeName = collegeDoc.exists ? collegeDoc.data()?.name : (clientCollegeName || "");

    stage = "fetchAssociatedData";
    let studentsByIdSnap, studentsByNameSnap, departmentsSnap, collegeAdminSnap, batchesSnap, examsSnap, resourcesSnap;
    try {
      [
        studentsByIdSnap,
        studentsByNameSnap,
        departmentsSnap,
        collegeAdminSnap,
        batchesSnap,
        examsSnap,
        resourcesSnap
      ] = await Promise.all([
        db.collection("students").where("collegeId", "==", id).get(),
        collegeName ? db.collection("students").where("collegeName", "==", collegeName).get() : Promise.resolve({ docs: [] }),
        db.collection("departments").where("collegeId", "==", id).get(),
        db.collection("users").where("role", "==", "college_admin").where("collegeId", "==", id).get(),
        db.collection("batches").where("collegeId", "==", id).get(),
        db.collection("exams").where("collegeId", "==", id).get(),
        db.collection("resources").where("collegeId", "==", id).get(),
      ]);
    } catch (err: any) {
      console.error({ route: "/api/admin/delete-college", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
      return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message, retryable: true }, { status: 500 });
    }

    const studentDocsMap = new Map();
    studentsByIdSnap.docs.forEach((d: any) => studentDocsMap.set(d.id, d));
    if (studentsByNameSnap && "docs" in studentsByNameSnap) {
      studentsByNameSnap.docs.forEach((d: any) => studentDocsMap.set(d.id, d));
    }
    const studentDocs = Array.from(studentDocsMap.values());
    const studentIds = studentDocs.map((d: any) => d.id);

    stage = "fetchExamResults";
    let examResultsSnaps = [];
    try {
      if (studentIds.length > 0) {
        // Firestore 'in' queries are limited to 10 items. So we chunk it.
        const chunkedStudentIds = [];
        for (let i = 0; i < studentIds.length; i += 10) {
          chunkedStudentIds.push(studentIds.slice(i, i + 10));
        }
        for (const chunk of chunkedStudentIds) {
          const results = await db.collection("exam_results").where("studentId", "in", chunk).get();
          examResultsSnaps.push(...results.docs);
        }
      }
    } catch (err: any) {
      console.error({ route: "/api/admin/delete-college", stage, errorCode: err?.code, message: err?.message });
      // We will continue even if fetching results partially fails, but log it.
    }

    stage = "deleteFirebaseAuthAccounts";
    const authDeletionErrors: string[] = [];
    const authIdsToDelete = [...studentIds, id, ...collegeAdminSnap.docs.map((d: any) => d.id)];

    for (const targetAuthId of authIdsToDelete) {
      try {
        await auth.deleteUser(targetAuthId);
      } catch (err: any) {
        if (err?.code !== "auth/user-not-found") {
          const errorMsg = `Failed to delete Auth ${targetAuthId}: ${err?.message || String(err)}`;
          console.error({ route: "/api/admin/delete-college", stage, target: targetAuthId, errorCode: err?.code, message: err?.message });
          authDeletionErrors.push(errorMsg);
        }
      }
    }

    if (authDeletionErrors.length > 0) {
      return NextResponse.json({
        success: false,
        stage,
        errorCode: "auth/deletion-failed",
        message: "Some Firebase Auth accounts could not be deleted",
        details: authDeletionErrors.join(", "),
        warning: "Some users may still be able to login. Manual Auth cleanup required.",
        retryable: true
      }, { status: 500 });
    }

    stage = "deleteStorageFiles";
    try {
      const bucket = getStorage(getAdminApp()).bucket();
      if (bucket) {
        await bucket.deleteFiles({ prefix: `colleges/${id}/` }).catch(() => {});
        // Also delete any other common prefixes if they existed by college
      }
    } catch (err) {
      console.warn("Storage deletion error (ignored):", err);
    }

    stage = "deleteFirestoreDocuments";
    const refsToDelete: any[] = [collegeRef, collegeUserDocRef];
    
    // Add all fetched collections
    studentDocs.forEach(d => {
      refsToDelete.push(d.ref);
      refsToDelete.push(db.collection("users").doc(d.id));
    });
    departmentsSnap.docs.forEach((d: any) => refsToDelete.push(d.ref));
    collegeAdminSnap.docs.forEach((d: any) => refsToDelete.push(d.ref));
    batchesSnap.docs.forEach((d: any) => refsToDelete.push(d.ref));
    examsSnap.docs.forEach((d: any) => refsToDelete.push(d.ref));
    resourcesSnap.docs.forEach((d: any) => refsToDelete.push(d.ref));
    examResultsSnaps.forEach(d => refsToDelete.push(d.ref));

    const MAX_OPS = 500;
    const batchPromises = [];
    for (let i = 0; i < refsToDelete.length; i += MAX_OPS) {
      const chunk = refsToDelete.slice(i, i + MAX_OPS);
      const batch = db.batch();
      for (const ref of chunk) {
        batch.delete(ref);
      }
      batchPromises.push(
        batch.commit().catch((err: any) => {
          console.error({ route: "/api/admin/delete-college", stage: "batchCommit", errorCode: err?.code, message: err?.message });
          throw err;
        })
      );
    }

    try {
      await Promise.all(batchPromises);
    } catch (err: any) {
      console.error({ route: "/api/admin/delete-college", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
      return NextResponse.json({ success: false, stage, errorCode: err?.code, message: "Failed to delete all firestore documents.", details: err?.message, retryable: true }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error({ route: "/api/admin/delete-college", stage: "unhandledException", errorCode: err?.code, message: err?.message, stack: err?.stack });
    return NextResponse.json(
      { success: false, stage: "unhandledException", errorCode: err?.code, message: "Internal server error.", details: String(err), retryable: true },
      { status: 500 }
    );
  }
}
