import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { deleteDocumentAdmin, deleteStorageDirectory } from '@/lib/services/cleanup-service';

export const dynamic = "force-dynamic";

const DeleteCollegeSchema = z.object({
  id: z.string().min(1, "College ID is required."),
  collegeName: z.string().optional(),
  step: z.enum(["init", "auth", "content", "exams", "finalize"]).optional().default("init"),
  cursor: z.string().optional(),
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
    
    const { id: collegeId, step, cursor } = parseResult.data;
    const CHUNK_SIZE = 50;

    console.log(`[DeleteCollege] Step: ${step}, Cursor: ${cursor || 'none'}`);

    // STEP: INIT - Setup and begin
    if (step === "init") {
      return NextResponse.json({ success: true, nextStep: "auth", cursor: undefined });
    }

    // STEP: AUTH - Delete Firebase Auth accounts for students/college_admins
    if (step === "auth") {
      let query = db.collection("students").where("collegeId", "==", collegeId).limit(CHUNK_SIZE);
      
      const snap = await query.get();
      if (snap.empty) {
        // Also delete college admin auth if we're done with students
        const collegeDoc = await db.collection("colleges").doc(collegeId).get();
        if (collegeDoc.exists) {
           const adminEmail = collegeDoc.data()?.adminEmail;
           if (adminEmail) {
             try {
               const adminUser = await auth.getUserByEmail(adminEmail);
               await auth.deleteUser(adminUser.uid);
               await db.collection("users").doc(adminUser.uid).delete();
             } catch(e) {}
           }
        }
        return NextResponse.json({ success: true, nextStep: "content", cursor: undefined });
      }

      const batchWrites = db.batch();
      const uids = snap.docs.map(d => d.id);
      
      await Promise.all(uids.map(uid => auth.deleteUser(uid).catch(() => {})));
      
      for (const doc of snap.docs) {
        batchWrites.delete(doc.ref);
        batchWrites.delete(db.collection("users").doc(doc.id));
      }
      await batchWrites.commit();

      return NextResponse.json({ success: true, nextStep: "auth", cursor: undefined });
    }

    // STEP: CONTENT - Delete users, students, resources, doubts, trainer_notes
    if (step === "content") {
      const collections = ["users", "students", "resources", "doubts", "trainer_notes", "batches", "departments", "courses"];
      let hasMoreAnywhere = false;
      
      const bulkWriter = db.bulkWriter();
      for (const col of collections) {
         const snap = await db.collection(col).where("collegeId", "==", collegeId).limit(CHUNK_SIZE).get();
         if (!snap.empty) {
            hasMoreAnywhere = true;
            snap.docs.forEach(d => bulkWriter.delete(d.ref));
         }
      }
      await bulkWriter.close();

      if (hasMoreAnywhere) {
         return NextResponse.json({ success: true, nextStep: "content", cursor: undefined });
      } else {
         return NextResponse.json({ success: true, nextStep: "exams", cursor: undefined });
      }
    }

    // STEP: EXAMS - Delete exams, results, questions
    if (step === "exams") {
       const examsSnap = await db.collection("exams").where("collegeId", "==", collegeId).limit(1).get();
       
       if (examsSnap.empty) {
          return NextResponse.json({ success: true, nextStep: "finalize", cursor: undefined });
       }

       const exam = examsSnap.docs[0];
       const bulkWriter = db.bulkWriter();
       
       const [resSnap, qSnap] = await Promise.all([
          db.collection("exam_results").where("examId", "==", exam.id).limit(250).get(),
          db.collection("questions").where("examId", "==", exam.id).limit(250).get()
       ]);

       resSnap.docs.forEach(d => bulkWriter.delete(d.ref));
       qSnap.docs.forEach(d => bulkWriter.delete(d.ref));

       if (resSnap.empty && qSnap.empty) {
          bulkWriter.delete(exam.ref);
       }
       
       await bulkWriter.close();
       return NextResponse.json({ success: true, nextStep: "exams", cursor: undefined });
    }

    // STEP: FINALIZE - Delete files and college doc
    if (step === "finalize") {
       await deleteStorageDirectory(`colleges/${collegeId}/`);
       await db.collection("colleges").doc(collegeId).delete();
       return NextResponse.json({ success: true, done: true, message: "College deleted successfully." });
    }

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
