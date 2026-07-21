import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
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
  try {
    const body = await request.json();
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
        { error: "Admin authorization token is required." },
        { status: 401 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "A valid student email address is required." },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "A valid student name is required." },
        { status: 400 }
      );
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired admin session." },
        { status: 401 }
      );
    }

    const db = getFirestore();
    const requesterUid = decodedToken.uid;
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists) {
      return NextResponse.json(
        { error: "Admin user not found in database." },
        { status: 403 }
      );
    }

    const requesterData = requesterDoc.data();
    const requesterRole = requesterData?.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json(
        { error: "Only admin or trainer roles can create student accounts." },
        { status: 403 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const studentName = name.trim();
    const finalCollegeName = (collegeName || "").trim().toLowerCase();
    const finalCollegeId = collegeId ? collegeId.trim() : collegeNameToId(finalCollegeName);
    const finalDepartment = (department || "Computer Science").trim();
    const finalAcademicYear = (academicYear || "1st Year").trim();
    const finalSection = (section || "A").toString().trim();
    const finalBatch = (batch || "General Cohort").trim();

    // Ensure the email is not already registered in Firebase Auth
    try {
      const existingUser = await adminAuth.getUserByEmail(normalizedEmail);
      return NextResponse.json(
        {
          error: "An account with this email address already exists.",
          uid: existingUser.uid,
        },
        { status: 409 }
      );
    } catch (err) {
      const code = getErrorCode(err);
      if (code !== "auth/user-not-found") {
        console.error("Admin getUserByEmail error:", err);
        return NextResponse.json(
          { error: "Could not verify email uniqueness." },
          { status: 500 }
        );
      }
    }

    // Create the Firebase Auth user with the default password
    let authUser;
    try {
      authUser = await adminAuth.createUser({
        email: normalizedEmail,
        password: DEFAULT_STUDENT_PASSWORD,
        displayName: studentName,
      });
    } catch (authErr) {
      console.error("Admin createUser error:", authErr);
      if (getErrorCode(authErr) === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "An account with this email address already exists." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error: "Failed to create Firebase Auth account.",
          details: getErrorMessage(authErr),
        },
        { status: 500 }
      );
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

    try {
      const batchWrite = db.batch();
      batchWrite.set(db.collection("users").doc(uid), userDoc);
      batchWrite.set(db.collection("students").doc(uid), studentDoc);
      await batchWrite.commit();
    } catch (dbErr) {
      // Best-effort rollback of the Auth user if Firestore write fails
      try {
        await adminAuth.deleteUser(uid);
      } catch {
        // ignore rollback error
      }
      console.error("Failed to write student Firestore documents:", dbErr);
      return NextResponse.json(
        {
          error: "Failed to create student profile documents.",
          details: getErrorMessage(dbErr),
        },
        { status: 500 }
      );
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
        error: "Internal server error.",
        details: getErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
