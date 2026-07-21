import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { uid } = await request.json();

    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "User ID (uid) is required." }, { status: 400 });
    }

    const db = getFirestore();

    // 1. Preserve student name in exam_results before deleting the student record
    const studentDoc = await db.collection("students").doc(uid).get();
    if (studentDoc.exists) {
      const studentData = studentDoc.data() || {};
      const resultsSnap = await db.collection("exam_results").where("studentId", "==", uid).get();
      const batch = db.batch();
      resultsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.studentName && studentData.name) {
          batch.update(docSnap.ref, { studentName: studentData.name });
        }
      });
      await batch.commit();
      await db.collection("students").doc(uid).update({ isDeleted: true, status: "deleted" });
    }

    // 2. Soft delete the user document (best effort)
    await db.collection("users").doc(uid).update({ isDeleted: true, status: "deleted" }).catch(() => {});

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
