import { supabaseAdmin } from "@/lib/supabase/admin";
import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bulkDeleteByQuery, deleteStorageDirectory } from '@/lib/services/cleanup-service';
import { prisma } from '@/lib/prisma';

export const dynamic = "force-dynamic";
// maxDuration removed - causing Next.js 16 build issues
// export const maxDuration = 60;

const DeleteCollegeSchema = z.object({
  id: z.string().min(1, "College ID is required."),
  studentUids: z.array(z.string()).optional()
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
          { authId: requesterUid },
          ...(adminUser.email ? [{ email: { equals: adminUser.email.toLowerCase().trim(), mode: "insensitive" as const } }] : [])
        ]
      }, 
      select: { role: true } 
    });
    const requesterError = null;
    
    if (!requesterDoc || requesterError) {
      console.error("delete-college: Admin user not found for UID:", requesterUid);
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: `Admin user not found in database for UID: ${requesterUid}` }, { status: 403 });
    }

    const requesterRole = requesterDoc.role;
    if (requesterRole !== "main_admin" && requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "superadmin") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admin or trainer roles can delete colleges." }, { status: 403 });
    }

    stage = "validatePayload";
    const body = await request.json().catch(() => ({}));
    const parseResult = await DeleteCollegeSchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: parseResult.error.issues[0].message }, { status: 400 });
    }
    
    const { id: collegeId } = parseResult.data;

    console.log(`[DeleteCollege] Starting full cascade deletion for college: ${collegeId}`);

    // STEP 1: Delete Supabase Auth accounts for students and college admin
    stage = "deleteAuthUsers";
    
    let studentUidsToDelete = parseResult.data.studentUids || [];
    let authUidsToDelete: string[] = [];
    
    if (studentUidsToDelete.length === 0) {
      let studentsSnap = await prisma.students.findMany({ where: { collegeId }, select: { id: true, authId: true } });
      studentUidsToDelete = studentsSnap.map(d => d.id);
      authUidsToDelete = studentsSnap.map(d => d.authId || d.id).filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    } else {
      let studentsSnap = await prisma.students.findMany({ where: { id: { in: studentUidsToDelete } }, select: { id: true, authId: true } });
      authUidsToDelete = studentsSnap.map(d => d.authId || d.id).filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    }

    console.log(`[DeleteCollege] Found ${authUidsToDelete.length} students to delete from Auth`);
    
    // Chunk Auth deletes to avoid rate limits
    for (let i = 0; i < authUidsToDelete.length; i += 50) {
      const chunk = authUidsToDelete.slice(i, i + 50);
      try {
        await Promise.all(chunk.map(uid => supabaseAdmin.auth.admin.deleteUser(uid)));
      } catch (err) {
        console.error(`[DeleteCollege] Warning: Failed to delete some auth users in chunk:`, err);
      }
    }

    // Delete college admin auth
    const collegeDoc = await prisma.colleges.findUnique({ where: { id: collegeId }, select: { adminEmail: true } });
    if (collegeDoc) {
      const adminEmail = collegeDoc.adminEmail;
      if (adminEmail) {
        try {
          // Find the admin user in users table
          const adminUserDoc = await prisma.users.findFirst({ where: { email: adminEmail }, select: { id: true, authId: true } });
          if (adminUserDoc) {
            const adminAuthId = adminUserDoc.authId || adminUserDoc.id;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminAuthId)) {
              await supabaseAdmin.auth.admin.deleteUser(adminAuthId);
            }
            await prisma.users.delete({ where: { id: adminUserDoc.id } });
          }
        } catch (e) {
          // Ignore if admin user doesn't exist in auth
        }
      }
    }

    // STEP 2: Bulk Delete Collections directly associated with the college
    stage = "deleteCollections";
    const collections = ["users", "students", "resources", "doubts", "trainer_notes", "batches", "student_batches"];
    
    if (parseResult.data.studentUids && parseResult.data.studentUids.length > 0) {
       // Only delete the explicitly specified students and their resources
       const explicitUids = parseResult.data.studentUids;
       
       // Chunk the deletes since POSTGREST has URL length limits for .in()
       for (let i = 0; i < explicitUids.length; i += 100) {
         const chunk = explicitUids.slice(i, i + 100);
         await prisma.students.deleteMany({ where: { id: { in: chunk } } });
         await prisma.users.deleteMany({ where: { id: { in: chunk } } });
       }
    }

    for (const col of collections) {
      try {
        await bulkDeleteByQuery(col, "collegeId", "==", collegeId);
      } catch (e) {}
    }

    // STEP 3: Delete Exams and their nested results/questions
    stage = "deleteExams";
    let examsSnap = await prisma.exams.findMany({ where: { collegeId }, select: { id: true } });

    console.log(`[DeleteCollege] Found ${examsSnap.length} exams to delete`);
    
    for (const examDoc of examsSnap) {
      await bulkDeleteByQuery("exam_results", "examId", "==", examDoc.id);
      await bulkDeleteByQuery("questions", "examId", "==", examDoc.id);
      await prisma.exams.delete({ where: { id: examDoc.id } });
    }

    // STEP 4: Delete College Storage Directory
    stage = "deleteStorage";
    await deleteStorageDirectory(`colleges/${collegeId}/`);

    // STEP 5: Delete College Document
    stage = "deleteCollegeDoc";
    if (collegeDoc) {
      await prisma.colleges.deleteMany({ where: { id: collegeId } });
    }
    // Cleanup any fallback docs
    try {
      await prisma.colleges.deleteMany({ where: { name: collegeId } });
    } catch(e) {}

    console.log(`[DeleteCollege] Completed deletion successfully for: ${collegeId}`);
    return NextResponse.json({ success: true, done: true, message: "College deleted successfully." });

  } catch (err: unknown) {
    console.error(`[DeleteCollege] Failed at stage ${stage}:`, err);
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
