import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const { uid } = await request.json().catch(() => ({}));

    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: "User ID (uid) is required." }, { status: 400 });
    }

    const app = getAdminApp();
    const db = getFirestore(app);

    stage = "fetchUserRecord";
    // SAFETY CHECK: Never delete a college document using this route
    const collegeDoc = await db.collection("colleges").doc(uid).get();
    if (collegeDoc.exists) {
      return NextResponse.json(
        { success: false, stage, errorCode: "permission-denied", message: "This ID matches a college record. User deletion aborted to protect college data." },
        { status: 403 }
      );
    }

    const userDoc = await db.collection("users").doc(uid).get();
    let targetEmail = "";
    
    if (userDoc.exists) {
      const uData = userDoc.data();
      if (uData?.email) targetEmail = uData.email.toLowerCase().trim();
    }

    stage = "fetchStudentData";
    const studentDoc = await db.collection("students").doc(uid).get();
    if (studentDoc.exists) {
      const sData = studentDoc.data();
      if (sData?.email) targetEmail = sData.email.toLowerCase().trim();
    }

    const refsToDelete: any[] = [];
    
    // 1. Fetch exam results
    stage = "fetchExamResults";
    try {
      const resultsSnap = await db.collection("exam_results").where("studentId", "==", uid).get();
      resultsSnap.docs.forEach((docSnap) => refsToDelete.push(docSnap.ref));
    } catch (err) {
      console.warn("Failed to fetch exam_results for deletion:", err);
    }

    // Delete any additional documents matching targetEmail
    stage = "fetchDuplicates";
    if (targetEmail) {
      try {
        const matchingStuds = await db.collection("students").where("email", "==", targetEmail).get();
        matchingStuds.docs.forEach(d => refsToDelete.push(d.ref));
        
        const matchingUsers = await db.collection("users").where("email", "==", targetEmail).get();
        matchingUsers.docs.forEach(d => refsToDelete.push(d.ref));
      } catch (err) {
        console.warn("Failed to fetch duplicate documents for deletion:", err);
      }
    }

    if (studentDoc.exists) refsToDelete.push(studentDoc.ref);
    if (userDoc.exists) refsToDelete.push(userDoc.ref);

    // 2. ⚠️ CRITICAL FIX: Delete Firebase Auth user - NO SILENT FAILURES
    stage = "deleteFirebaseAuthAccounts";
    const auth = getAdminAuth();
    const authDeletionErrors: string[] = [];

    // Delete by UID
    try {
      await auth.revokeRefreshTokens(uid).catch(() => {});
      await auth.deleteUser(uid);
    } catch (err: any) {
      if (err?.code !== "auth/user-not-found") {
        const errorMsg = `Failed to delete Auth user by UID ${uid}: ${err?.message || String(err)}`;
        console.error(errorMsg);
        authDeletionErrors.push(errorMsg);
      }
    }

    // Delete by email to catch orphans
    if (targetEmail) {
      try {
        const authUserByEmail = await auth.getUserByEmail(targetEmail);
        if (authUserByEmail) {
          await auth.revokeRefreshTokens(authUserByEmail.uid).catch(() => {});
          await auth.deleteUser(authUserByEmail.uid);
        }
      } catch (err: any) {
        if (err?.code !== "auth/user-not-found") {
          const errorMsg = `Failed to delete Auth user by email ${targetEmail}: ${err?.message || String(err)}`;
          console.error(errorMsg);
          authDeletionErrors.push(errorMsg);
        }
      }
    }

    // If Auth deletion failed, return error
    if (authDeletionErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          stage,
          errorCode: "auth/deletion-failed",
          message: "Some Firebase Auth accounts could not be deleted",
          details: authDeletionErrors.join(", "),
          warning: "User may still be able to login. Manual Auth cleanup required.",
          retryable: true
        },
        { status: 500 }
      );
    }

    stage = "deleteStorageFiles";
    try {
      const bucket = getStorage(getAdminApp()).bucket();
      if (bucket) {
        // Just in case we store files by user uid in the future
        await bucket.deleteFiles({ prefix: `users/${uid}/` }).catch(() => {});
      }
    } catch (err) {
      console.warn("Storage deletion error (ignored):", err);
    }

    stage = "deleteFirestoreDocuments";
    const uniqueRefs = Array.from(new Set(refsToDelete.map(r => r.path))).map(path => db.doc(path));
    
    const MAX_OPS = 500;
    const batchPromises = [];
    for (let i = 0; i < uniqueRefs.length; i += MAX_OPS) {
      const chunk = uniqueRefs.slice(i, i + MAX_OPS);
      const batch = db.batch();
      for (const ref of chunk) {
        batch.delete(ref);
      }
      batchPromises.push(
        batch.commit().catch((err: any) => {
          console.error({ route: "/api/delete-user", stage: "batchCommit", errorCode: err?.code, message: err?.message });
          throw err;
        })
      );
    }

    try {
      await Promise.all(batchPromises);
    } catch (err: any) {
      console.error({ route: "/api/delete-user", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
      return NextResponse.json({ success: false, stage, errorCode: err?.code, message: "Failed to delete all firestore documents.", details: err?.message, retryable: true }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "User deleted completely." });
  } catch (err: any) {
    console.error("Delete user endpoint error:", err);
    return NextResponse.json(
      { success: false, stage: "unhandledException", errorCode: err?.code, message: "Internal server error.", details: err?.message || String(err), retryable: true },
      { status: 500 }
    );
  }
}
