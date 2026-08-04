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
    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "main_admin") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admins or trainers can create college accounts." }, { status: 403 });
    }

    stage = "checkEmailUniqueness";
    const normalizedEmail = email.toLowerCase().trim();
    const displayName = `${collegeName.trim()} Admin`;
    
    // DIAGNOSTIC LOGGING - START
    console.log(`\n========================================`);
    console.log(`[CreateCollege] 🔍 CHECKING EMAIL: "${normalizedEmail}"`);
    console.log(`[CreateCollege] College Name: "${collegeName}"`);
    console.log(`[CreateCollege] College ID: "${collegeId}"`);

    // Pre-flight Firestore Check across all relevant collections  
    const [existingUsersSnapshot, existingStudentsSnapshot] = await Promise.all([
      db.collection("users").where("email", "==", normalizedEmail).get(),
      db.collection("students").where("email", "==", normalizedEmail).get()
    ]);
    
    console.log(`\n[CreateCollege] 📊 RAW QUERY RESULTS:`);
    console.log(`  - Users found: ${existingUsersSnapshot.docs.length}`);
    console.log(`  - Students found: ${existingStudentsSnapshot.docs.length}`);
    
    // Log ALL found documents with full details
    if (existingUsersSnapshot.docs.length > 0) {
      console.log(`\n[CreateCollege] 👤 USERS FOUND:`);
      existingUsersSnapshot.docs.forEach((doc, idx) => {
        const data = doc.data();
        console.log(`  User ${idx + 1}:`, {
          id: doc.id,
          email: data.email,
          role: data.role,
          isActive: data.isActive,
          isDeleted: data.isDeleted,
          collegeId: data.collegeId,
          collegeName: data.collegeName
        });
      });
    }
    
    if (existingStudentsSnapshot.docs.length > 0) {
      console.log(`\n[CreateCollege] 🎓 STUDENTS FOUND:`);
      existingStudentsSnapshot.docs.forEach((doc, idx) => {
        const data = doc.data();
        console.log(`  Student ${idx + 1}:`, {
          id: doc.id,
          email: data.email,
          isActive: data.isActive,
          isDeleted: data.isDeleted,
          collegeId: data.collegeId
        });
      });
    }
    
    // Filter for ACTIVE records only
    console.log(`\n[CreateCollege] 🔎 FILTERING FOR ACTIVE RECORDS...`);
    const activeUsers = existingUsersSnapshot.docs.filter(doc => {
      const data = doc.data();
      const isActive = data.isActive !== false && data.isDeleted !== true;
      console.log(`  User ${doc.id}: isActive=${data.isActive}, isDeleted=${data.isDeleted} → ${isActive ? 'KEEP' : 'SKIP'}`);
      return isActive;
    });
    console.log(`  ✓ Active users after filter: ${activeUsers.length}`);
    
    const activeStudents = existingStudentsSnapshot.docs.filter(doc => {
      const data = doc.data();
      const isActive = data.isActive !== false && data.isDeleted !== true;
      console.log(`  Student ${doc.id}: isActive=${data.isActive}, isDeleted=${data.isDeleted} → ${isActive ? 'KEEP' : 'SKIP'}`);
      return isActive;
    });
    console.log(`  ✓ Active students after filter: ${activeStudents.length}`);
    
    if (activeUsers.length > 0 || activeStudents.length > 0) {
      console.log(`\n[CreateCollege] ❌ CONFLICT DETECTED!`);
      console.log(`  Conflicting users:`, activeUsers.map(d => ({ id: d.id, email: d.data().email, role: d.data().role })));
      console.log(`  Conflicting students:`, activeStudents.map(d => ({ id: d.id, email: d.data().email })));
      console.log(`========================================\n`);
      
      return NextResponse.json({ 
        success: false, 
        stage, 
        errorCode: "firestore/email-already-exists", 
        message: "This email is already registered to an existing active account/college." 
      }, { status: 409 });
    }
    
    console.log(`\n[CreateCollege] ✅ No Firestore conflicts found`);
    console.log(`[CreateCollege] 🔍 Checking Firebase Auth...`);

    try {
      const existingAuthUser = await auth.getUserByEmail(normalizedEmail);
      console.log(`[CreateCollege] ❌ Email EXISTS in Firebase Auth:`, {
        uid: existingAuthUser.uid,
        email: existingAuthUser.email,
        disabled: existingAuthUser.disabled
      });
      console.log(`========================================\n`);
      return NextResponse.json({ success: false, stage, errorCode: "auth/email-already-exists", message: "An account with this email already exists in Firebase Auth." }, { status: 409 });
    } catch (err) {
      if (getErrorCode(err) !== "auth/user-not-found") {
        console.error(`[CreateCollege] ⚠️  Error checking auth:`, err);
        console.log(`========================================\n`);
        return NextResponse.json({ success: false, stage, errorCode: getErrorCode(err), message: "Could not verify email uniqueness.", details: getErrorMessage(err), retryable: true }, { status: 500 });
      }
    }
    
    console.log(`[CreateCollege] ✅ Email not in Firebase Auth`);
    console.log(`[CreateCollege] 🎉 EMAIL IS AVAILABLE - Proceeding with creation...`);
    console.log(`========================================\n`)

    stage = "createAuthUser";
    let authUser = null;
    try {
      authUser = await auth.createUser({
        email: normalizedEmail,
        password: password,
        displayName: displayName,
      });
      console.log(`[CreateCollege] ✅ Created Auth user: ${authUser.uid}`);
    } catch (authErr) {
      console.error("[CreateCollege] ❌ createUser error:", authErr);
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
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    stage = "createFirestoreDocument";
    try {
      await auth.setCustomUserClaims(uid, { role: "college_admin", collegeId: collegeId });
      await db.collection("users").doc(uid).set(userDoc);
      console.log(`[CreateCollege] ✅ Created Firestore doc: ${uid}`);
      console.log(`[CreateCollege] 🎉 SUCCESS!\n`);
    } catch (dbErr) {
      console.error("[CreateCollege] ❌ Firestore write failed:", dbErr);
      stage = "rollbackAuthUser";
      try {
        await auth.deleteUser(uid);
        console.log(`[CreateCollege] ✅ Rolled back Auth user`);
      } catch (rollbackErr) {
        console.error("[CreateCollege] ❌ CRITICAL: Rollback failed:", rollbackErr);
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
    console.error("[CreateCollege] ❌ Unhandled error:", err);
    return NextResponse.json({ success: false, stage: "unhandledException", errorCode: getErrorCode(err), message: "Internal server error.", details: getErrorMessage(err), retryable: true }, { status: 500 });
  }
}

