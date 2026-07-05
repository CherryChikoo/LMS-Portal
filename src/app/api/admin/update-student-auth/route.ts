import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { uid, email, password, adminIdToken } = await request.json();

    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "User ID (uid) is required." }, { status: 400 });
    }

    // Verify the requester is an admin via their Firebase ID token
    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    // Check that the requester has an admin/trainer role
    const requesterUid = decodedToken.uid;
    const db = getFirestore();

    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists) {
      return NextResponse.json({ error: "Admin user not found in database." }, { status: 403 });
    }

    const requesterData = requesterDoc.data();
    const requesterRole = requesterData?.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json({ error: "Only admin or trainer roles can update student auth." }, { status: 403 });
    }

    // Validate that at least one of email or password is provided
    if (!email && !password) {
      return NextResponse.json(
        { error: "At least one of 'email' or 'password' must be provided to update." },
        { status: 400 }
      );
    }

    // Build the Auth update payload
    const authUpdateFields: Record<string, string> = {};
    if (email) {
      const normalizedEmail = (email as string).toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
      }
      authUpdateFields.email = normalizedEmail;
    }
    if (password) {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters." },
          { status: 400 }
        );
      }
      authUpdateFields.password = password;
    }

    // Update the Firebase Auth user
    try {
      await adminAuth.updateUser(uid, authUpdateFields);
    } catch (authErr: unknown) {
      if ((authErr as { code?: string }).code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "This email address is already in use by another account." },
          { status: 409 }
        );
      }
      if ((authErr as { code?: string }).code === "auth/user-not-found") {
        return NextResponse.json(
          { error: "Student Firebase Auth account not found. They may need to sign up first." },
          { status: 404 }
        );
      }
      console.error("Admin updateUser error:", authErr);
      return NextResponse.json(
        { error: "Failed to update Firebase Auth account.", details: (authErr as Error)?.message || String(authErr) },
        { status: 500 }
      );
    }

    // Sync email to Firestore users doc and students doc
    const batch = db.batch();

    if (email) {
      const normalizedEmail = (email as string).toLowerCase().trim();

      // Update users collection
      const userDocRef = db.collection("users").doc(uid);
      batch.update(userDocRef, { email: normalizedEmail });

      // Update students collection
      const studentDocRef = db.collection("students").doc(uid);
      batch.update(studentDocRef, { email: normalizedEmail });
    }

    // When password is updated, clear mustChangePassword and initialPassword flags
    if (password) {
      const userDocRef = db.collection("users").doc(uid);
      batch.update(userDocRef, {
        mustChangePassword: false,
        initialPassword: "",
      });

      const studentDocRef = db.collection("students").doc(uid);
      batch.update(studentDocRef, {
        mustChangePassword: false,
        initialPassword: "",
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Update student auth endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: (err as { message?: string })?.message || String(err) },
      { status: 500 }
    );
  }
}