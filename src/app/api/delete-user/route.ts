import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { uid } = await request.json();

    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "User ID (uid) is required." }, { status: 400 });
    }

    const db = getFirestore();

    // SAFETY CHECK: Only allow deleting students. Never delete admin/trainer/college_admin users.
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const role = userData?.role;
      if (role && role !== "student") {
        return NextResponse.json(
          { error: `Cannot delete a ${role} account through this endpoint. Only student accounts can be deleted here.` },
          { status: 403 }
        );
      }
    }

    // SAFETY CHECK: Never delete a college document. Verify the uid does NOT match a college doc.
    const collegeDoc = await db.collection("colleges").doc(uid).get();
    if (collegeDoc.exists) {
      return NextResponse.json(
        { error: "This ID matches a college record. Student deletion aborted to protect college data." },
        { status: 403 }
      );
    }

    // 1. Delete all exam_results for this student
    const studentDoc = await db.collection("students").doc(uid).get();
    if (studentDoc.exists) {
      const resultsSnap = await db.collection("exam_results").where("studentId", "==", uid).get();
      if (!resultsSnap.empty) {
        const batch = db.batch();
        resultsSnap.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }
      
      // Delete the student document
      await db.collection("students").doc(uid).delete();
    }

    // 2. Delete the user document (only if role is student or missing)
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (!userData?.role || userData.role === "student") {
        await db.collection("users").doc(uid).delete();
      }
    }

    // 3. Delete the Firebase Auth user and revoke active sessions (best effort)
    try {
      await adminAuth.revokeRefreshTokens(uid).catch(() => {});
      await adminAuth.deleteUser(uid);
    } catch (authErr: any) {
      // If the user does not exist in Auth, that's fine for a JIT-only record
      if (authErr?.code !== "auth/user-not-found") {
        console.error("Failed to delete Auth user:", authErr);
        return NextResponse.json(
          { error: "Failed to delete Firebase Auth user.", details: authErr?.message || String(authErr) },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Delete user endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
