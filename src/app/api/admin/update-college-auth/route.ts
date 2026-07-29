import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const body = await request.json().catch(() => ({}));
    const { adminIdToken, oldEmail, newEmail, newPassword, collegeId, collegeName } = body;

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ success: false, stage, error: "Admin authorization token is required." }, { status: 401 });
    }
    if (!collegeId) {
      return NextResponse.json({ success: false, stage, error: "College ID is required." }, { status: 400 });
    }

    stage = "verifyAdminToken";
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err: any) {
      console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err.code, message: err.message });
      return NextResponse.json({ success: false, stage, error: "Invalid or expired admin session." }, { status: 401 });
    }

    stage = "verifyAdminRole";
    const db = getFirestore();
    const requesterUid = decodedToken.uid;
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists) {
      return NextResponse.json({ success: false, stage, error: "Admin user not found in database." }, { status: 403 });
    }

    const requesterRole = requesterDoc.data()?.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json({ success: false, stage, error: "Only admins or trainers can update college accounts." }, { status: 403 });
    }

    stage = "findExistingAuth";
    let targetUid: string | null = null;
    let currentEmail = oldEmail ? oldEmail.toLowerCase().trim() : null;

    if (currentEmail) {
      try {
        const existingUser = await auth.getUserByEmail(currentEmail);
        targetUid = existingUser.uid;
      } catch (err: any) {
        if (err?.code !== "auth/user-not-found") {
          console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
          return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message }, { status: 500 });
        }
      }
    }

    stage = "findExistingFirestoreProfile";
    if (!targetUid) {
      try {
        const usersQuery = await db.collection("users")
          .where("collegeId", "==", collegeId)
          .where("role", "==", "college_admin")
          .get();

        if (!usersQuery.empty) {
          targetUid = usersQuery.docs[0].id;
          currentEmail = usersQuery.docs[0].data().email;
        }
      } catch (err: any) {
        console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
        return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message }, { status: 500 });
      }
    }

    const normalizedNewEmail = newEmail ? newEmail.toLowerCase().trim() : currentEmail;

    stage = "createMissingAuthProfile";
    if (!targetUid) {
      if (!normalizedNewEmail && !newPassword) {
        // No profile exists and user didn't provide credentials. Just silently succeed.
        return NextResponse.json({ success: true, uid: null, email: null });
      }
      if (!normalizedNewEmail || !newPassword) {
        return NextResponse.json({ success: false, stage, error: "Account does not exist yet. Both email and password are required to enable login." }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ success: false, stage, error: "The password must be at least 6 characters." }, { status: 400 });
      }

      try {
        const authUser = await auth.createUser({
          email: normalizedNewEmail,
          password: newPassword,
          displayName: `${collegeName?.trim() || "College"} Admin`,
        });
        targetUid = authUser.uid;
      } catch (err: any) {
        if (err?.code === "auth/email-already-exists") {
          return NextResponse.json({ success: false, stage, errorCode: err.code, message: "An account with this email address already exists." }, { status: 409 });
        }
        console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
        return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message, details: err?.stack }, { status: 500 });
      }

      stage = "createMissingFirestoreProfile";
      try {
        const now = FieldValue.serverTimestamp();
        await db.collection("users").doc(targetUid).set({
          id: targetUid,
          email: normalizedNewEmail,
          displayName: `${collegeName?.trim() || "College"} Admin`,
          role: "college_admin",
          collegeId: collegeId,
          collegeName: collegeName?.trim() || "",
          createdAt: now,
          updatedAt: now,
        });

        return NextResponse.json({ success: true, uid: targetUid, email: normalizedNewEmail });
      } catch (err: any) {
        console.error("Failed to write new college user document:", err);
        stage = "rollbackAuthUser";
        try {
          await auth.deleteUser(targetUid);
        } catch (rollbackErr) {
          console.error("CRITICAL: Failed to rollback auth user creation after Firestore error:", rollbackErr);
        }
        return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message, details: err?.stack }, { status: 500 });
      }
    }

    stage = "updateFirebaseAuth";
    const updatePayload: any = {};
    if (newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json({ success: false, stage, error: "The password must be at least 6 characters." }, { status: 400 });
      }
      updatePayload.password = newPassword;
    }
    if (normalizedNewEmail && normalizedNewEmail !== currentEmail) {
      try {
        await auth.getUserByEmail(normalizedNewEmail);
        return NextResponse.json({ success: false, stage, errorCode: "auth/email-already-exists", message: "New email already in use." }, { status: 409 });
      } catch (err: any) {
        if (err?.code !== "auth/user-not-found") {
          console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
          return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message }, { status: 500 });
        }
      }
      updatePayload.email = normalizedNewEmail;
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await auth.updateUser(targetUid, updatePayload);
      } catch (err: any) {
        console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
        return NextResponse.json({ success: false, stage, errorCode: err?.code, message: err?.message, details: err?.stack }, { status: 500 });
      }
    }

    stage = "updateFirestoreProfile";
    if (updatePayload.email) {
      try {
        await db.collection("users").doc(targetUid).set({
          email: updatePayload.email,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err: any) {
        console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
        // ⚠️ CRITICAL FIX: Return error if Firestore sync fails
        return NextResponse.json({
          success: false,
          stage,
          error: "Auth updated but Firestore sync failed",
          errorCode: err?.code,
          message: err?.message,
          warning: "Email updated in Auth but not synced to Firestore database"
        }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, uid: targetUid, email: normalizedNewEmail });
  } catch (err: any) {
    console.error({ route: "/api/admin/update-college-auth", stage: "unhandledException", errorCode: err?.code, message: err?.message, stack: err?.stack });
    return NextResponse.json({ success: false, stage: "unhandledException", errorCode: err?.code, message: err?.message, details: String(err) }, { status: 500 });
  }
}
