import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { uid } = await request.json();

    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "User ID (uid) is required." }, { status: 400 });
    }

    const app = getAdminApp();
    const db = getFirestore(app);

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

    // 1. Find email and clean up exam_results
    let targetEmail = "";
    const studentDoc = await db.collection("students").doc(uid).get();
    if (studentDoc.exists) {
      const sData = studentDoc.data();
      if (sData?.email) targetEmail = sData.email.toLowerCase().trim();
      const resultsSnap = await db.collection("exam_results").where("studentId", "==", uid).get();
      if (!resultsSnap.empty) {
        const batch = db.batch();
        resultsSnap.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }
      await db.collection("students").doc(uid).delete();
    }

    if (!targetEmail && userDoc.exists) {
      const uData = userDoc.data();
      if (uData?.email) targetEmail = uData.email.toLowerCase().trim();
    }

    // Delete any additional student or user documents matching targetEmail
    if (targetEmail) {
      const matchingStuds = await db.collection("students").where("email", "==", targetEmail).get();
      matchingStuds.forEach((d) => d.ref.delete().catch(() => {}));
      const matchingUsers = await db.collection("users").where("email", "==", targetEmail).get();
      matchingUsers.forEach((d) => {
        if (d.data()?.role === "student" || !d.data()?.role) {
          d.ref.delete().catch(() => {});
        }
      });
    }

    // 2. Delete the user document
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (!userData?.role || userData.role === "student") {
        await db.collection("users").doc(uid).delete();
      }
    }

    // 3. Delete the Firebase Auth user by UID and email
    const auth = getAdminAuth();
    try {
      await auth.revokeRefreshTokens(uid).catch(() => {});
      await auth.deleteUser(uid);
    } catch (_) {}

    if (targetEmail) {
      try {
        const authUserByEmail = await auth.getUserByEmail(targetEmail);
        if (authUserByEmail) {
          await auth.revokeRefreshTokens(authUserByEmail.uid).catch(() => {});
          await auth.deleteUser(authUserByEmail.uid);
        }
      } catch (_) {}
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
