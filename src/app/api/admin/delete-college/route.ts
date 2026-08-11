import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { bulkDeleteByQuery, deleteStorageDirectory } from '@/lib/services/cleanup-service';

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for bulk deletion on Vercel

const DeleteCollegeSchema = z.object({
  id: z.string().min(1, "College ID is required.")
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
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err: unknown) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-token", message: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    stage = "verifyAdminRole";
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data()?.role : undefined;
    
    if (requesterRole !== "main_admin" && requesterRole !== "admin" && requesterRole !== "trainer") {
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

    // STEP 1: Delete Firebase Auth accounts for students and college admin
    stage = "deleteAuthUsers";
    let studentsSnap = await db.collection("students").where("collegeId", "==", collegeId).get();
    if (studentsSnap.empty) {
      studentsSnap = await db.collection("students").where("collegeName", "==", collegeId).get();
    }

    const studentUids = studentsSnap.docs.map(d => d.id);
    console.log(`[DeleteCollege] Found ${studentUids.length} students to delete from Auth`);
    
    // Chunk Auth deletes in batches of 1000 (Firebase Admin limit)
    for (let i = 0; i < studentUids.length; i += 1000) {
      const chunk = studentUids.slice(i, i + 1000);
      try {
        await auth.deleteUsers(chunk);
      } catch (err) {
        console.error(`[DeleteCollege] Warning: Failed to delete some auth users in chunk:`, err);
      }
    }

    // Delete college admin auth
    const collegeDoc = await db.collection("colleges").doc(collegeId).get();
    if (collegeDoc.exists) {
      const adminEmail = collegeDoc.data()?.adminEmail;
      if (adminEmail) {
        try {
          const adminUser = await auth.getUserByEmail(adminEmail);
          await auth.deleteUser(adminUser.uid);
          await db.collection("users").doc(adminUser.uid).delete();
        } catch (e) {
          // Ignore if admin user doesn't exist in auth
        }
      }
    }

    // STEP 2: Bulk Delete Collections directly associated with the college
    stage = "deleteCollections";
    const collections = ["users", "students", "resources", "doubts", "trainer_notes", "batches", "departments", "courses"];
    
    for (const col of collections) {
      await bulkDeleteByQuery(col, "collegeId", "==", collegeId);
      // Fallback for older schemas
      await bulkDeleteByQuery(col, "collegeName", "==", collegeId);
    }

    // STEP 3: Delete Exams and their nested results/questions
    stage = "deleteExams";
    let examsSnap = await db.collection("exams").where("collegeId", "==", collegeId).get();
    if (examsSnap.empty) {
      examsSnap = await db.collection("exams").where("collegeName", "==", collegeId).get();
    }

    console.log(`[DeleteCollege] Found ${examsSnap.size} exams to delete`);
    const bulkWriter = db.bulkWriter();
    
    for (const examDoc of examsSnap.docs) {
      await bulkDeleteByQuery("exam_results", "examId", "==", examDoc.id);
      await bulkDeleteByQuery("questions", "examId", "==", examDoc.id);
      bulkWriter.delete(examDoc.ref);
    }
    await bulkWriter.close();

    // STEP 4: Delete College Storage Directory
    stage = "deleteStorage";
    await deleteStorageDirectory(`colleges/${collegeId}/`);

    // STEP 5: Delete College Document
    stage = "deleteCollegeDoc";
    if (collegeDoc.exists) {
      await db.collection("colleges").doc(collegeId).delete();
    }
    // Cleanup any fallback docs
    await bulkDeleteByQuery("colleges", "name", "==", collegeId);

    console.log(`[DeleteCollege] Completed deletion successfully for: ${collegeId}`);
    return NextResponse.json({ success: true, done: true, message: "College deleted successfully." });

  } catch (err: unknown) {
    console.error(`[DeleteCollege] Failed at stage ${stage}:`, err);
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
