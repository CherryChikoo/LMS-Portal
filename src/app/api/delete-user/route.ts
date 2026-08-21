import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteStorageDirectory } from '@/lib/services/cleanup-service';
import { revalidatePath } from "next/cache";
import { invalidateCache } from "@/lib/cache/query-cache";

const DeleteUserSchema = z.object({
  uid: z.string().min(1, "User ID (uid) is required."),
}).strict();

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, stage, errorCode: "unauthenticated", message: "Missing or invalid authorization token." }, { status: 401 });
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    stage = "verifyAdminToken";
    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);
    
    if (verifyError || !adminUser) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-token", message: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = adminUser.id;

    const requesterDoc = await prisma.users.findFirst({ 
      where: { 
        OR: [
          { id: requesterUid },
          { authId: requesterUid }
        ]
      }, 
      select: { role: true, collegeId: true } 
    });
    const requesterRole = requesterDoc?.role;
    
    if (requesterRole !== "main_admin" && requesterRole !== "admin" && requesterRole !== "college_admin" && requesterRole !== "trainer" && requesterRole !== "superadmin") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admins and trainers can delete users." }, { status: 403 });
    }

    stage = "validatePayload";
    const body = await request.json().catch(() => ({}));
    const parseResult = await DeleteUserSchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: parseResult.error.issues[0].message }, { status: 400 });
    }
    const { uid } = parseResult.data;

    stage = "fetchUserRecord";
    // SAFETY CHECK: Never delete a college document using this route
    const collegeDoc = await prisma.colleges.findUnique({ where: { id: uid }, select: { id: true } });
    if (collegeDoc) {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "This ID matches a college record. User deletion aborted to protect college data." }, { status: 403 });
    }

    const userDoc = await prisma.users.findUnique({ where: { id: uid }, select: { email: true, authId: true } });
    let targetEmail = userDoc?.email ? userDoc.email.toLowerCase().trim() : "";
    let targetAuthId = userDoc?.authId || uid;

    stage = "fetchStudentData";
    const studentDoc = await prisma.students.findUnique({ where: { id: uid }, select: { collegeId: true, users: { select: { email: true } } } });
    
    if (studentDoc) {
      if (studentDoc.users?.email) targetEmail = studentDoc.users.email.toLowerCase().trim();
      
      // BOLA check: If college_admin, ensure they only delete students in their college
      if (requesterRole === "college_admin") {
        const requesterCollegeId = requesterDoc?.collegeId;
        if (studentDoc.collegeId !== requesterCollegeId) {
          return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "You can only delete users belonging to your college." }, { status: 403 });
        }
      }
    } else if (requesterRole === "college_admin") {
       // college_admin trying to delete non-student
       return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "You can only delete students belonging to your college." }, { status: 403 });
    }

    // Prisma will automatically cascade deletes if foreign keys are set up correctly.
    // However, since we did a naive migration, we should manually delete dependent records just to be safe.
    
    stage = "deleteDependentRecords";
    await Promise.all([
      prisma.exam_results.deleteMany({ where: { studentId: uid } }),
      prisma.trainer_notes.deleteMany({ where: { studentId: uid } }),
      prisma.doubts.deleteMany({ where: { studentId: uid } }),
    ]);

    // Delete duplicates by email if exists
    if (targetEmail) {
      await prisma.students.deleteMany({ where: { users: { email: targetEmail }, id: { not: uid } } });
      await prisma.users.deleteMany({ where: { email: targetEmail, id: { not: uid } } });
    }

    // Delete the actual documents sequentially to avoid foreign key constraint violations
    await prisma.students.deleteMany({ where: { id: uid } });
    await prisma.users.deleteMany({ where: { id: uid } });

    // UPDATE COLLEGE STUDENT COUNT - decrement by 1
    if (studentDoc?.collegeId) {
      await prisma.colleges.update({
        where: { id: studentDoc.collegeId },
        data: { studentCount: { decrement: 1 } }
      }).catch((err) => {
        console.error("Failed to decrement college studentCount:", err);
        // Non-critical - don't fail the entire request if count update fails
      });
    }

    stage = "deleteSupabaseAuthAccounts";
    const authDeletionErrors: string[] = [];
    
    // First get the user by ID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (targetAuthId && uuidRegex.test(targetAuthId)) {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetAuthId);
      if (deleteError && deleteError.message !== "User not found") {
        authDeletionErrors.push(`UID: ${deleteError.message}`);
      }
    } else {
      console.log(`[DeleteUser] Skipping Supabase Auth deletion for ${uid} as targetAuthId '${targetAuthId}' is not a UUID`);
    }

    // If targetEmail exists, maybe there's a user in auth.users with that email
    // Since we don't have a direct getUserByEmail, we can list users or skip it.
    // Usually deleting by UID is sufficient since the UID is the primary key.

    if (authDeletionErrors.length > 0) {
      console.warn(`[DeleteUser] Non-fatal Auth deletion errors:`, authDeletionErrors.join(" | "));
    }

    stage = "deleteStorageFiles";
    await deleteStorageDirectory(`users/${uid}/`);

    try {
      invalidateCache();
      revalidatePath('/', 'layout');
    } catch (_) {}

    return NextResponse.json({ success: true, message: "User deleted completely." });
  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage: "unhandledException", message, retryable: true }, { status: 500 });
  }
}
