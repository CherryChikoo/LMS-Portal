import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
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
      const auth = getAdminAuth();
      decodedToken = await auth.verifyIdToken(adminIdToken);
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
    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "college" && requesterRole !== "college_admin") {
      return NextResponse.json({ error: "Only admin, trainer, or college roles can update student auth." }, { status: 403 });
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
      const auth = getAdminAuth();
      await auth.updateUser(uid, authUpdateFields);
    } catch (authErr: unknown) {
      const authErrCode = (authErr as { code?: string })?.code;

      if (authErrCode === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "Update failed: This email address is already in use by another account.", errorCode: "auth/email-already-exists" },
          { status: 409 }
        );
      }

      if (authErrCode === "auth/user-not-found") {
        try {
          const auth = getAdminAuth();
          const studentDoc = await db.collection("students").doc(uid).get();
          const studentData = studentDoc.data() || {};
          const fallbackEmail = (email as string)?.toLowerCase().trim() || studentData.email;
          let fallbackPassword = password || studentData.initialPassword || "Welcome@123";
          if (typeof fallbackPassword !== "string" || fallbackPassword.length < 6) {
            fallbackPassword = "Welcome@123";
          }
          const fallbackName = studentData.name || "Student";

          if (!fallbackEmail) {
            return NextResponse.json(
              { error: "Student email is required to create an Auth account." },
              { status: 400 }
            );
          }

          await auth.createUser({
            uid: uid,
            email: fallbackEmail,
            password: fallbackPassword,
            displayName: fallbackName,
          });
        } catch (createErr: any) {
          if (createErr?.code === "auth/email-already-exists") {
            return NextResponse.json(
              { error: "Update failed: This email address is already in use by another account.", errorCode: "auth/email-already-exists" },
              { status: 409 }
            );
          }
          console.error("Admin createUser error for missing user:", createErr);
          return NextResponse.json(
            { error: createErr?.message || "Failed to create missing Firebase Auth account." },
            { status: 500 }
          );
        }
      } else {
        console.error("Admin updateUser error:", authErr);
        return NextResponse.json(
          { error: (authErr as any)?.message || "Failed to update Firebase Auth account." },
          { status: 500 }
        );
      }
    }

    // Sync email to Firestore users doc and students doc
    const batch = db.batch();

    if (email) {
      const normalizedEmail = (email as string).toLowerCase().trim();

      // Update users collection safely with merge
      const userDocRef = db.collection("users").doc(uid);
      batch.set(userDocRef, { email: normalizedEmail }, { merge: true });

      // Update students collection safely with merge
      const studentDocRef = db.collection("students").doc(uid);
      batch.set(studentDocRef, { email: normalizedEmail }, { merge: true });
    }

    // When password is updated, clear mustChangePassword and initialPassword flags
    if (password) {
      const userDocRef = db.collection("users").doc(uid);
      batch.set(userDocRef, {
        mustChangePassword: false,
        initialPassword: "",
      }, { merge: true });

      const studentDocRef = db.collection("students").doc(uid);
      batch.set(studentDocRef, {
        mustChangePassword: false,
        initialPassword: "",
      }, { merge: true });
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