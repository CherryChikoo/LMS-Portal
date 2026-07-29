import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DEFAULT_STUDENT_PASSWORD = "Welcome@123";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

function collegeNameToId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const body = await request.json().catch(() => ({}));
    const {
      adminIdToken,
      email,
      name,
      collegeId,
      collegeName,
      department,
      academicYear,
      section,
      batch,
    } = body;

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json(
        { success: false, stage, errorCode: "auth/missing-token", message: "Admin authorization token is required." },
        { status: 401 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, stage, errorCode: "auth/invalid-email", message: "A valid student email address is required." },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, stage, errorCode: "invalid-argument", message: "A valid student name is required." },
        { status: 400 }
      );
    }

    stage = "verifyAdminToken";
    let decodedToken;
    try {
      const auth = getAdminAuth();
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err) {
      return NextResponse.json(
        { success: false, stage, errorCode: getErrorCode(err), message: "Invalid or expired admin session.", details: getErrorMessage(err) },
        { status: 401 }
      );
    }

    stage = "verifyAdminRole";
    const db = getFirestore();
    const requesterUid = decodedToken.uid;
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists) {
      return NextResponse.json(
        { success: false, stage, errorCode: "permission-denied", message: "Admin user not found in database." },
        { status: 403 }
      );
    }

    const requesterData = requesterDoc.data();
    const requesterRole = requesterData?.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "college_admin") {
      return NextResponse.json(
        { success: false, stage, errorCode: "permission-denied", message: "Only admin, trainer, or college roles can create student accounts." },
        { status: 403 }
      );
    }

    stage = "checkEmailUniqueness";
    const normalizedEmail = email.toLowerCase().trim();
    const studentName = name.trim();
    const finalCollegeName = (collegeName || "").trim().toLowerCase();
    const finalCollegeId = collegeId ? collegeId.trim() : collegeNameToId(finalCollegeName);
    const finalDepartment = (department || "Computer Science").trim();
    const finalAcademicYear = (academicYear || "1st Year").trim();
    const finalSection = (section || "A").toString().trim();
    const finalBatch = (batch || "General Cohort").trim();

    const auth = getAdminAuth();
    let authUser = null;
    let reusedExistingAccount = false;

    try {
      const existingUser = await auth.getUserByEmail(normalizedEmail);
      // Check if an active student profile doc exists in Firestore
      const studentDocSnap = await db.collection("students").doc(existingUser.uid).get();
      const emailQuerySnap = await db.collection("students").where("email", "==", normalizedEmail).get();

      const activeStudentExists = studentDocSnap.exists || !emailQuerySnap.empty;

      if (activeStudentExists) {
        return NextResponse.json(
          {
            success: false, stage, errorCode: "auth/email-already-exists",
            message: "An active student account with this email address already exists.",
            uid: existingUser.uid,
          },
          { status: 409 }
        );
      }

      // Re-use existing Auth account whose Firestore student profile was deleted
      stage = "updateExistingAuthUser";
      await auth.updateUser(existingUser.uid, {
        password: DEFAULT_STUDENT_PASSWORD,
        displayName: studentName,
      });
      authUser = existingUser;
      reusedExistingAccount = true;
    } catch (err) {
      const code = getErrorCode(err);
      if (code !== "auth/user-not-found") {
        console.error("Admin getUserByEmail error:", err);
        return NextResponse.json(
          { success: false, stage, errorCode: code, message: "Could not verify email uniqueness.", details: getErrorMessage(err), retryable: true },
          { status: 500 }
        );
      }
    }

    // Create the Firebase Auth user if it didn't exist
    if (!authUser) {
      stage = "createAuthUser";
      try {
        authUser = await auth.createUser({
          email: normalizedEmail,
          password: DEFAULT_STUDENT_PASSWORD,
          displayName: studentName,
        });
      } catch (authErr) {
        console.error("Admin createUser error:", authErr);
        if (getErrorCode(authErr) === "auth/email-already-exists") {
          return NextResponse.json(
            { success: false, stage, errorCode: "auth/email-already-exists", message: "An account with this email address already exists." },
            { status: 409 }
          );
        }
        return NextResponse.json(
          {
            success: false, stage, errorCode: getErrorCode(authErr),
            message: "Failed to create Firebase Auth account.",
            details: getErrorMessage(authErr), retryable: true
          },
          { status: 500 }
        );
      }
    }

    const uid = authUser.uid;
    const now = FieldValue.serverTimestamp();

    const userDoc = {
      id: uid,
      email: normalizedEmail,
      displayName: studentName,
      role: "student",
      collegeId: finalCollegeId,
      collegeName: finalCollegeName,
      department: finalDepartment,
      academicYear: finalAcademicYear,
      section: finalSection,
      batchIds: [finalBatch],
      mustChangePassword: true,
      initialPassword: DEFAULT_STUDENT_PASSWORD,
      createdAt: now,
      updatedAt: now,
    };

    const studentDoc = {
      id: uid,
      name: studentName,
      email: normalizedEmail,
      collegeId: finalCollegeId,
      collegeName: finalCollegeName,
      department: finalDepartment,
      academicYear: finalAcademicYear,
      semester: 1,
      section: finalSection,
      rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
      batchIds: [finalBatch],
      mustChangePassword: true,
      initialPassword: DEFAULT_STUDENT_PASSWORD,
      enrollmentType: "manual",
      createdAt: now,
      updatedAt: now,
    };

    stage = "createFirestoreDocuments";
    try {
      const batchWrite = db.batch();
      batchWrite.set(db.collection("users").doc(uid), userDoc);
      batchWrite.set(db.collection("students").doc(uid), studentDoc);
      await batchWrite.commit();
    } catch (dbErr) {
      console.error("Failed to write student Firestore documents:", dbErr);
      stage = "rollbackAuthUser";
      
      // Rollback of the Auth user if Firestore write fails (only if we didn't re-use an existing one)
      if (!reusedExistingAccount) {
        try {
          await auth.deleteUser(uid);
        } catch (rollbackErr) {
          console.error("CRITICAL: Failed to rollback auth student creation after Firestore error:", rollbackErr);
          return NextResponse.json(
            { success: false, stage, errorCode: getErrorCode(dbErr), message: "Failed to create student profile documents. Auth rollback also failed.", details: `DB Error: ${getErrorMessage(dbErr)} | Rollback Error: ${getErrorMessage(rollbackErr)}`, retryable: false },
            { status: 500 }
          );
        }
        return NextResponse.json(
          {
            success: false, stage, errorCode: getErrorCode(dbErr),
            message: "Failed to create student profile documents. Account creation was rolled back safely.",
            details: getErrorMessage(dbErr), retryable: true
          },
          { status: 500 }
        );
      } else {
        return NextResponse.json(
          {
            success: false, stage, errorCode: getErrorCode(dbErr),
            message: "Failed to create student profile documents.",
            details: getErrorMessage(dbErr), retryable: true
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      uid,
      email: normalizedEmail,
      initialPassword: DEFAULT_STUDENT_PASSWORD,
    });
  } catch (err) {
    console.error("Create student auth endpoint error:", err);
    return NextResponse.json(
      {
        success: false, stage: "unhandledException", errorCode: getErrorCode(err),
        message: "Internal server error.",
        details: getErrorMessage(err), retryable: true
      },
      { status: 500 }
    );
  }
}
