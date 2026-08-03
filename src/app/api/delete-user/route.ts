import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { z } from "zod";

const DeleteUserSchema = z.object({
  uid: z.string().min(1, "User ID (uid) is required."),
}).strict();

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, stage, errorCode: "unauthenticated", message: "Missing or invalid authorization token." }, { status: 401 });
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    stage = "verifyAdminToken";
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err: unknown) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-token", message: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    stage = "verifyAdminRole";
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data()?.role : undefined;
    
    if (requesterRole !== "main_admin" && requesterRole !== "admin" && requesterRole !== "college_admin") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admins can delete users." }, { status: 403 });
    }

    stage = "validatePayload";
    const body = await request.json().catch(() => ({}));
    const parseResult = await DeleteUserSchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: parseResult.error.errors[0].message }, { status: 400 });
    }
    const { uid } = parseResult.data;

    stage = "fetchUserRecord";
    // SAFETY CHECK: Never delete a college document using this route
    const collegeDoc = await db.collection("colleges").doc(uid).get();
    if (collegeDoc.exists) {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "This ID matches a college record. User deletion aborted to protect college data." }, { status: 403 });
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
      
      // BOLA check: If college_admin, ensure they only delete students in their college
      if (requesterRole === "college_admin") {
        const requesterCollegeId = requesterDoc.data()?.collegeId;
        if (sData?.collegeId !== requesterCollegeId) {
          return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "You can only delete users belonging to your college." }, { status: 403 });
        }
      }
    } else if (requesterRole === "college_admin") {
       // college_admin trying to delete non-student
       return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "You can only delete students belonging to your college." }, { status: 403 });
    }

    const refsToDelete: any[] = [];
    
    // 1. Fetch exam results
    stage = "fetchExamResults";
    try {
      const resultsSnap = await db.collection("exam_results").where("studentId", "==", uid).get();
      resultsSnap.docs.forEach((docSnap) => refsToDelete.push(docSnap.ref));
    } catch (err) {
      console.warn("Failed to fetch exam_results for deletion.");
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
        console.warn("Failed to fetch duplicate documents for deletion.");
      }
    }

    if (studentDoc.exists) refsToDelete.push(studentDoc.ref);
    if (userDoc.exists) refsToDelete.push(userDoc.ref);

    stage = "deleteFirebaseAuthAccounts";
    const authDeletionErrors: string[] = [];
    try {
      await auth.revokeRefreshTokens(uid).catch(() => {});
      await auth.deleteUser(uid);
    } catch (err: unknown) {
      if ((err as any)?.code !== "auth/user-not-found") {
        authDeletionErrors.push("Failed to delete Auth user by UID.");
      }
    }

    if (targetEmail) {
      try {
        const authUserByEmail = await auth.getUserByEmail(targetEmail);
        if (authUserByEmail) {
          await auth.revokeRefreshTokens(authUserByEmail.uid).catch(() => {});
          await auth.deleteUser(authUserByEmail.uid);
        }
      } catch (err: unknown) {
        if ((err as any)?.code !== "auth/user-not-found") {
          authDeletionErrors.push("Failed to delete Auth user by email.");
        }
      }
    }

    if (authDeletionErrors.length > 0) {
      return NextResponse.json({ success: false, stage, errorCode: "auth/deletion-failed", message: "Some Firebase Auth accounts could not be deleted", retryable: true }, { status: 500 });
    }

    stage = "deleteStorageFiles";
    try {
      const bucket = getStorage(getAdminApp()).bucket();
      if (bucket) {
        await bucket.deleteFiles({ prefix: `users/${uid}/` }).catch(() => {});
      }
    } catch (err) {
      console.warn("Storage deletion error ignored.");
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
      batchPromises.push(batch.commit());
    }

    await Promise.all(batchPromises);
    return NextResponse.json({ success: true, message: "User deleted completely." });
  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage: "unhandledException", message, retryable: true }, { status: 500 });
  }
}
