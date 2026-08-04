import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { email, adminIdToken } = await request.json();

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Verify admin
    const auth = getAdminAuth();
    try {
      await auth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email exists in Firestore
    const db = getFirestore();
    const existingUsersSnapshot = await db.collection("users").where("email", "==", normalizedEmail).get();
    if (!existingUsersSnapshot.empty) {
      return NextResponse.json({
        exists: true,
        uid: existingUsersSnapshot.docs[0].id,
        provider: "firestore"
      });
    }

    // Check if email exists in Firebase Auth
    try {
      const existingUser = await auth.getUserByEmail(normalizedEmail);
      return NextResponse.json({
        exists: true,
        uid: existingUser.uid,
        provider: existingUser.providerData[0]?.providerId || "password"
      });
    } catch (err: unknown) {
      if ((err as any)?.code === "auth/user-not-found") {
        return NextResponse.json({ exists: false });
      }
      throw err;
    }
  } catch (err: unknown) {
    console.error("Check email exists error:", err);
    return NextResponse.json(
      { error: "Failed to check email existence.", details: (err as any)?.message || String(err) },
      { status: 500 }
    );
  }
}
