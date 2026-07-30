import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { idToken, newEmail } = await request.json();

    if (!idToken || !newEmail) {
      return NextResponse.json(
        { error: "Missing idToken or newEmail" },
        { status: 400 }
      );
    }

    const cleanEmail = (newEmail as string).toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    let decodedToken;
    try {
      const auth = getAdminAuth();
      decodedToken = await auth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired session. Please sign in again." },
        { status: 401 }
      );
    }

    const uid = decodedToken.uid;
    const auth = getAdminAuth();

    // 1. Explicit Firebase Auth Update with Collision Protection
    try {
      await auth.updateUser(uid, { email: cleanEmail });
    } catch (error: any) {
      if (error.code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "Update failed: This email address is already in use by another account.", errorCode: "auth/email-already-exists" },
          { status: 409 }
        );
      }
      console.error("Admin updateUser error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update Firebase Auth user." },
        { status: 500 }
      );
    }

    // 2. Atomic Firestore Document Sync
    const db = getFirestore();
    try {
      const batch = db.batch();
      const userRef = db.collection("users").doc(uid);
      const studentRef = db.collection("students").doc(uid);

      batch.set(userRef, { email: cleanEmail, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      batch.set(studentRef, { email: cleanEmail, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

      // If this user is a college_admin, update their college document adminEmail as well
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        const uData = userSnap.data();
        if (uData?.collegeId) {
          const collegeRef = db.collection("colleges").doc(uData.collegeId);
          batch.set(collegeRef, { adminEmail: cleanEmail, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      }

      await batch.commit();
    } catch (dbErr: any) {
      console.error("[CRITICAL SYNC FAILURE] Auth email updated successfully, but Firestore update failed:", dbErr);
      return NextResponse.json(
        {
          success: true,
          warning: "Email updated in Auth, but Firestore sync encountered an issue.",
          details: dbErr.message,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, uid, email: cleanEmail });
  } catch (error: any) {
    console.error("Admin update email root error:", error);

    if (error.code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "Update failed: This email address is already in use by another account.", errorCode: "auth/email-already-exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to update email" },
      { status: 500 }
    );
  }
}
