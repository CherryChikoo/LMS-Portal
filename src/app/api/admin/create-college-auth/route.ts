import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";



function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const body = await request.json().catch(() => ({}));
    const { adminIdToken, email, password, collegeId, collegeName } = body;

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ success: false, stage, errorCode: "auth/missing-token", message: "Admin authorization token is required." }, { status: 401 });
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ success: false, stage, errorCode: "auth/invalid-email", message: "Valid admin email is required." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ success: false, stage, errorCode: "auth/weak-password", message: "The password must be a string with at least 6 characters." }, { status: 400 });
    }
    if (!collegeId || !collegeName) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: "College ID and name are required." }, { status: 400 });
    }

    stage = "verifyAdminToken";
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err) {
      return NextResponse.json({ success: false, stage, errorCode: getErrorCode(err), message: "Invalid or expired admin session.", details: getErrorMessage(err) }, { status: 401 });
    }

    stage = "verifyAdminRole";
    const db = getFirestore();
    const requesterUid = decodedToken.uid;
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists) {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Admin user not found in database." }, { status: 403 });
    }

    const requesterRole = requesterDoc.data()?.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admins or trainers can create college accounts." }, { status: 403 });
    }

    stage = "checkEmailUniqueness";
    const normalizedEmail = email.toLowerCase().trim();
    const displayName = `${collegeName.trim()} Admin`;

    // Pre-flight Firestore Check across all relevant collections
    const existingUsersSnapshot = await db.collection("users").where("email", "==", normalizedEmail).get();
    const existingCollegesSnapshot = await db.collection("colleges").where("adminEmail", "==", normalizedEmail).get();
    const existingStudentsSnapshot = await db.collection("students").where("email", "==", normalizedEmail).get();
    
    if (!existingUsersSnapshot.empty || !existingCollegesSnapshot.empty || !existingStudentsSnapshot.empty) {
      return NextResponse.json({ success: false, stage, errorCode: "firestore/email-already-exists", message: "This email is already registered to an existing account/college." }, { status: 409 });
    }

    try {
      await auth.getUserByEmail(normalizedEmail);
      return NextResponse.json({ success: false, stage, errorCode: "auth/email-already-exists", message: "An account with this email already exists." }, { status: 409 });
    } catch (err) {
      if (getErrorCode(err) !== "auth/user-not-found") {
        return NextResponse.json({ success: false, stage, errorCode: getErrorCode(err), message: "Could not verify email uniqueness.", details: getErrorMessage(err), retryable: true }, { status: 500 });
      }
    }

    stage = "createAuthUser";
    let authUser = null;
    try {
      authUser = await auth.createUser({
        email: normalizedEmail,
        password: password,
        displayName: displayName,
      });
    } catch (authErr) {
      console.error("Admin createUser error:", authErr);
      if (getErrorCode(authErr) === "auth/email-already-exists") {
        return NextResponse.json({ success: false, stage, errorCode: "auth/email-already-exists", message: "An account with this email address already exists." }, { status: 409 });
      }
      return NextResponse.json(
        { success: false, stage, errorCode: getErrorCode(authErr), message: "Failed to create Firebase Auth account.", details: getErrorMessage(authErr), retryable: true },
        { status: 500 }
      );
    }

    const uid = authUser.uid;
    const now = FieldValue.serverTimestamp();

    const userDoc = {
      id: uid,
      email: normalizedEmail,
      displayName: displayName,
      role: "college_admin",
      collegeId: collegeId,
      collegeName: collegeName.trim(),
      createdAt: now,
      updatedAt: now,
    };

    stage = "createFirestoreDocument";
    try {
      await auth.setCustomUserClaims(uid, { role: "college_admin", collegeId: collegeId });
      await db.collection("users").doc(uid).set(userDoc);
    } catch (dbErr) {
      console.error("Failed to write college user document:", dbErr);
      stage = "rollbackAuthUser";
      try {
        await auth.deleteUser(uid);
      } catch (rollbackErr) {
        console.error("CRITICAL: Failed to rollback auth user creation after Firestore error:", rollbackErr);
        return NextResponse.json(
          { success: false, stage, errorCode: getErrorCode(dbErr), message: "Failed to create college user profile. Auth rollback also failed.", details: `DB Error: ${getErrorMessage(dbErr)} | Rollback Error: ${getErrorMessage(rollbackErr)}`, retryable: false },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { success: false, stage, errorCode: getErrorCode(dbErr), message: "Failed to create college user profile. Account creation was rolled back safely.", details: getErrorMessage(dbErr), retryable: true },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, uid, email: normalizedEmail });
  } catch (err) {
    console.error("Create college auth endpoint error:", err);
    return NextResponse.json({ success: false, stage: "unhandledException", errorCode: getErrorCode(err), message: "Internal server error.", details: getErrorMessage(err), retryable: true }, { status: 500 });
  }
}

