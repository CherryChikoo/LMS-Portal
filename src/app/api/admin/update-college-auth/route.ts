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
          console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message });
          return NextResponse.json({ success: false, stage, error: err?.message || "Error locating target user account." }, { status: 500 });
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
        console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message });
        return NextResponse.json({ success: false, stage, error: err?.message || "Error locating college admin document." }, { status: 500 });
      }
    }

    const normalizedNewEmail = newEmail ? newEmail.toLowerCase().trim() : currentEmail;

    if (!targetUid) {
      // Auto-provision Auth account if no prior Auth user exists for this college
      try {
        const fallbackEmail = normalizedNewEmail;
        const fallbackPassword = newPassword || "Welcome@123";
        if (!fallbackEmail) {
          return NextResponse.json({ success: false, stage, error: "College admin email is required to create a login account." }, { status: 400 });
        }
        const createdUser = await auth.createUser({
          email: fallbackEmail,
          password: fallbackPassword,
          displayName: `${collegeName?.trim() || "College"} Admin`,
        });
        targetUid = createdUser.uid;
      } catch (createErr: any) {
        if (createErr?.code === "auth/email-already-exists") {
          return NextResponse.json({ success: false, stage, errorCode: createErr.code, error: "Update failed: This email address is already in use by another account." }, { status: 409 });
        }
        return NextResponse.json({ success: false, stage, errorCode: createErr?.code, error: createErr?.message || "Failed to create college admin Auth account." }, { status: 500 });
      }
    }

    // Pre-Flight Server-Side Input Sanitization
    if (newEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedNewEmail)) {
        return NextResponse.json({ success: false, stage, error: "Please enter a valid email address." }, { status: 400 });
      }
    }
    if (newPassword) {
      if (typeof newPassword !== "string" || newPassword.length < 6) {
        return NextResponse.json({ success: false, stage, error: "Password must be at least 6 characters long." }, { status: 400 });
      }
    }

    stage = "updateFirebaseAuth";
    const updatePayload: Record<string, string> = {};
    if (newPassword) updatePayload.password = newPassword;
    if (normalizedNewEmail && normalizedNewEmail !== currentEmail) updatePayload.email = normalizedNewEmail;

    // STEP 2: Await adminAuth.updateUser FIRST
    if (Object.keys(updatePayload).length > 0) {
      try {
        await auth.updateUser(targetUid, updatePayload);
      } catch (err: any) {
        if (err?.code === "auth/email-already-exists") {
          return NextResponse.json({ success: false, stage, errorCode: err.code, error: "Update failed: This email address is already in use by another account." }, { status: 409 });
        }
        if (err?.code === "auth/invalid-email") {
          return NextResponse.json({ success: false, stage, errorCode: err.code, error: "Please enter a valid email address." }, { status: 400 });
        }
        if (err?.code === "auth/weak-password") {
          return NextResponse.json({ success: false, stage, errorCode: err.code, error: "Password does not meet minimum security requirements." }, { status: 400 });
        }
        if (err?.code === "auth/user-not-found") {
          // If the Auth account was missing, auto-create it with targetUid
          try {
            const fallbackEmail = normalizedNewEmail || currentEmail;
            const fallbackPassword = newPassword || "Welcome@123";
            if (!fallbackEmail) {
              return NextResponse.json({ success: false, stage, error: "College admin email is required to create a login account." }, { status: 400 });
            }
            await auth.createUser({
              uid: targetUid,
              email: fallbackEmail,
              password: fallbackPassword,
              displayName: `${collegeName?.trim() || "College"} Admin`,
            });
          } catch (createErr: any) {
            if (createErr?.code === "auth/email-already-exists") {
              return NextResponse.json({ success: false, stage, errorCode: createErr.code, error: "Update failed: This email address is already in use by another account." }, { status: 409 });
            }
            return NextResponse.json({ success: false, stage, errorCode: createErr?.code, error: createErr?.message || "Failed to create missing college admin Auth account." }, { status: 500 });
          }
        } else {
          console.error({ route: "/api/admin/update-college-auth", stage, errorCode: err?.code, message: err?.message });
          return NextResponse.json({ success: false, stage, errorCode: err?.code, error: err?.message || "Failed to update Firebase Auth user." }, { status: 500 });
        }
      }
    }

    // STEP 3: Await Firestore Sync SECOND
    stage = "updateFirestoreProfile";
    if (updatePayload.email || collegeName) {
      try {
        const batch = db.batch();
        const userDocRef = db.collection("users").doc(targetUid);
        const userUpdateData: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
        if (updatePayload.email) userUpdateData.email = updatePayload.email;
        if (collegeName) userUpdateData.collegeName = collegeName.trim();
        batch.set(userDocRef, userUpdateData, { merge: true });

        const colDocRef = db.collection("colleges").doc(collegeId);
        const colUpdateData: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
        if (updatePayload.email) colUpdateData.adminEmail = updatePayload.email;
        if (collegeName) colUpdateData.name = collegeName.trim();
        batch.set(colDocRef, colUpdateData, { merge: true });

        await batch.commit();
      } catch (err: any) {
        console.error("[CRITICAL SYNC FAILURE] Auth updated but Firestore sync failed:", err);
        return NextResponse.json({
          success: false,
          stage,
          error: "Auth updated but Firestore sync encountered an issue.",
          warning: err?.message,
        }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, uid: targetUid, email: normalizedNewEmail });
  } catch (err: any) {
    console.error({ route: "/api/admin/update-college-auth", stage: "unhandledException", errorCode: err?.code, message: err?.message });
    return NextResponse.json({ success: false, stage: "unhandledException", error: err?.message || "Internal server error." }, { status: 500 });
  }
}
