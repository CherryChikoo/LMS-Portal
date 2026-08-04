import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { bulkDeleteByQuery, deleteDocumentAdmin, deleteStorageDirectory } from '@/lib/services/cleanup-service';

const DeleteCollegeSchema = z.object({
  id: z.string().min(1, "College ID is required."),
  collegeName: z.string().optional(),
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

    stage = "gatherAuthUids";
    const authUidsToDelete = new Set<string>();
    
    // Add college admin emails (from the college doc)
    const collegeDoc = await db.collection("colleges").doc(collegeId).get();
    if (collegeDoc.exists) {
      const adminEmail = collegeDoc.data()?.adminEmail;
      if (adminEmail) {
        try {
          const u = await auth.getUserByEmail(adminEmail.toLowerCase().trim());
          authUidsToDelete.add(u.uid);
        } catch (_) {}
      }
    }

    // Fetch all users tied to this college
    const usersSnap = await db.collection("users").where("collegeId", "==", collegeId).get();
    usersSnap.docs.forEach(doc => authUidsToDelete.add(doc.id));

    // Fetch all students tied to this college
    const studentsSnap = await db.collection("students").where("collegeId", "==", collegeId).get();
    studentsSnap.docs.forEach(doc => authUidsToDelete.add(doc.id));

    stage = "deleteAuthAccounts";
    const uidsArray = Array.from(authUidsToDelete);
    if (uidsArray.length > 0) {
      try {
        await auth.deleteUsers(uidsArray);
      } catch (err: any) {
        console.warn(`[CleanupService] Some Auth accounts failed to delete: ${err.message}`);
      }
    }

    stage = "fetchExamAndStudentDependencies";
    const examsSnap = await db.collection("exams").where("collegeId", "==", collegeId).get();
    const examIds = examsSnap.docs.map(doc => doc.id);

    stage = "cascadingDelete";
    // 1. Delete all exam_results for the exams tied to this college
    const bulkWriter = db.bulkWriter();
    for (const eId of examIds) {
      const eResSnap = await db.collection("exam_results").where("examId", "==", eId).get();
      eResSnap.docs.forEach(doc => bulkWriter.delete(doc.ref));
      
      const qSnap = await db.collection("questions").where("examId", "==", eId).get();
      qSnap.docs.forEach(doc => bulkWriter.delete(doc.ref));
    }
    
    // 2. Delete all exam_results for students in this college
    if (uidsArray.length > 0) {
      // Chunk uidsArray into batches of 10 for 'in' queries
      for (let i = 0; i < uidsArray.length; i += 10) {
        const chunk = uidsArray.slice(i, i + 10);
        const chunkResSnap = await db.collection("exam_results").where("studentId", "in", chunk).get();
        chunkResSnap.docs.forEach(doc => bulkWriter.delete(doc.ref));
      }
    }
    await bulkWriter.close();

    // 3. Bulk delete primary collections by collegeId (Dual Sweep)
    let collegeName = parseResult.data.collegeName;
    if (!collegeName && collegeDoc.exists) {
      collegeName = collegeDoc.data()?.name;
    }

    // Pass 1: Strict ID Sweep
    await bulkDeleteByQuery("students", "collegeId", "==", collegeId);
    await bulkDeleteByQuery("users", "collegeId", "==", collegeId);
    
    // Pass 2: Loose Name Sweep (catch-all for ghost CSV imports)
    if (collegeName) {
      await bulkDeleteByQuery("students", "collegeName", "==", collegeName);
      await bulkDeleteByQuery("users", "collegeName", "==", collegeName);
    }

    // Cascade wipe other collections (Strict ID Sweep)
    await bulkDeleteByQuery("exams", "collegeId", "==", collegeId);
    await bulkDeleteByQuery("batches", "collegeId", "==", collegeId);
    await bulkDeleteByQuery("departments", "collegeId", "==", collegeId);
    await bulkDeleteByQuery("resources", "collegeId", "==", collegeId);

    // Pass 2: Loose Name Sweep for other collections (catch-all for ghost records)
    if (collegeName) {
      await bulkDeleteByQuery("exams", "collegeName", "==", collegeName);
      await bulkDeleteByQuery("batches", "collegeName", "==", collegeName);
      await bulkDeleteByQuery("departments", "collegeName", "==", collegeName);
      await bulkDeleteByQuery("resources", "collegeName", "==", collegeName);
    }
    
    // Wipe nested student data (Dual Sweep)
    if (uidsArray.length > 0) {
      const studentBulkWriter = db.bulkWriter();
      for (let i = 0; i < uidsArray.length; i += 10) {
        const chunk = uidsArray.slice(i, i + 10);
        const notesSnap = await db.collection("trainer_notes").where("studentId", "in", chunk).get();
        notesSnap.docs.forEach(doc => studentBulkWriter.delete(doc.ref));
        const doubtsSnap = await db.collection("doubts").where("studentId", "in", chunk).get();
        doubtsSnap.docs.forEach(doc => studentBulkWriter.delete(doc.ref));
      }
      await studentBulkWriter.close();
    }
    
    // 4. Delete college document itself
    await deleteDocumentAdmin("colleges", collegeId);

    // 5. Cloud Storage Garbage Collection
    stage = "deleteStorageFiles";
    await deleteStorageDirectory(`colleges/${collegeId}/`);

    return NextResponse.json({ 
      success: true, 
      message: "College and all associated data completely deleted.",
      purgedAuthAccounts: uidsArray.length
    });
  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
