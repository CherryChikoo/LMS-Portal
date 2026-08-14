import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const authHeader = request.headers.get("authorization");
    const adminIdToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;

    const body = await request.json().catch(() => ({}));
    const { email, password, collegeId, collegeName } = body;

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
    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);
    
    if (verifyError || !adminUser) {
      return NextResponse.json({ success: false, stage, errorCode: getErrorCode(verifyError), message: "Invalid or expired admin session.", details: getErrorMessage(verifyError) }, { status: 401 });
    }

    stage = "verifyAdminRole";
    const requesterUid = adminUser.id;
    const requesterDoc = await prisma.users.findFirst({ 
      where: { 
        OR: [
          { id: requesterUid },
          { authId: requesterUid }
        ]
      }, 
      select: { role: true } 
    });
    
    if (!requesterDoc) {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Admin user not found in database." }, { status: 403 });
    }

    const requesterRole = requesterDoc.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "main_admin" && requesterRole !== "superadmin") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admins or trainers can create college accounts." }, { status: 403 });
    }

    stage = "checkEmailUniqueness";
    const normalizedEmail = email.toLowerCase().trim();
    const displayName = `${collegeName.trim()} Admin`;
    
    // Pre-flight Prisma Check across all relevant collections  
    const existingUser = await prisma.users.findFirst({ where: { email: normalizedEmail }, select: { id: true } });
    const existingStudent = await prisma.students.findFirst({ where: { users: { email: normalizedEmail } }, select: { id: true } });
    
    if (existingUser || existingStudent) {
      return NextResponse.json({ 
        success: false, 
        stage, 
        errorCode: "database/email-already-exists", 
        message: "This email is already registered to an existing active account/college." 
      }, { status: 409 });
    }

    stage = "createAuthUser";
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: displayName, role: 'college_admin', collegeId: collegeId },
    });

    if (authErr) {
      if (authErr.message.includes("already exists") || authErr.message.includes("unique")) {
        return NextResponse.json({ success: false, stage, errorCode: "auth/email-already-exists", message: "An account with this email address already exists." }, { status: 409 });
      }
      return NextResponse.json(
        { success: false, stage, errorCode: getErrorCode(authErr), message: "Failed to create Supabase Auth account.", details: getErrorMessage(authErr), retryable: true },
        { status: 500 }
      );
    }

    const uid = authUser.user.id;

    const userDoc = {
      id: uid,
      email: normalizedEmail,
      displayName: displayName,
      role: "college_admin",
      collegeId: collegeId,
    };

    stage = "createDatabaseDocument";
    try {
      await prisma.users.create({ data: userDoc });
      
      console.log(`[CreateCollege] ✅ Created database doc: ${uid}`);
      console.log(`[CreateCollege] 🎉 SUCCESS!`);
    } catch (dbErr) {
      console.error("[CreateCollege] ❌ Database write failed:", dbErr);
      stage = "rollbackAuthUser";
      try {
        await supabaseAdmin.auth.admin.deleteUser(uid);
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
