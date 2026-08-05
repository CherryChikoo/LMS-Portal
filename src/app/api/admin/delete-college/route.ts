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
      // For auth deletion, we'll chunk by students collection
      let query = db.collection("students").where("collegeId", "==", collegeId).orderBy("__name__").limit(CHUNK_SIZE);
      if (cursor) {
        const cursorDoc = await db.collection("students").doc(cursor).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }
      
      const snap = await query.get();
      if (snap.empty) {
        // Also delete college admin auth if we're done with students
        const collegeDoc = await db.collection("colleges").doc(collegeId).get();
        if (collegeDoc.exists) {
           const adminEmail = collegeDoc.data()?.adminEmail;
           if (adminEmail) {
             try {
                const u = await auth.getUserByEmail(adminEmail.toLowerCase().trim());
                const userDoc = await db.collection("users").doc(u.uid).get();
                if (userDoc.exists && userDoc.data()?.role === "college_admin") {
                  await auth.deleteUser(u.uid);
                }
             } catch(e) {}
           }
        }
        return NextResponse.json({ success: true, nextStep: "content", cursor: undefined });
      }

      const uids = snap.docs.map(d => d.id);
      try {
        await auth.deleteUsers(uids);
      } catch (err) {
        console.warn("[DeleteCollege] Auth deletion chunk failed/partial", err);
      }

      const nextCursor = snap.docs[snap.docs.length - 1].id;
      return NextResponse.json({ success: true, nextStep: "auth", cursor: nextCursor });
    }

    // STEP: CONTENT - Delete users, students, resources, doubts, trainer_notes
    if (step === "content") {
      const collections = ["users", "students", "resources", "doubts", "trainer_notes", "batches", "departments", "courses"];
      let hasMoreAnywhere = false;
      
      const bulkWriter = db.bulkWriter();
      for (const col of collections) {
         // Because we can't easily cursor across multiple collections in one request reliably under 10s,
         // we just delete the first CHUNK_SIZE of whatever we find. Next request will delete more.
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
       // We fetch ONE exam at a time, delete its results and questions, then delete the exam.
       const examsSnap = await db.collection("exams").where("collegeId", "==", collegeId).limit(1).get();
       
       if (examsSnap.empty) {
          return NextResponse.json({ success: true, nextStep: "finalize", cursor: undefined });
       }

       const exam = examsSnap.docs[0];
       const bulkWriter = db.bulkWriter();
       
       // Delete max 400 results/questions for this exam to stay under limit
       const [resSnap, qSnap] = await Promise.all([
          db.collection("exam_results").where("examId", "==", exam.id).limit(250).get(),
          db.collection("questions").where("examId", "==", exam.id).limit(250).get()
       ]);

       resSnap.docs.forEach(d => bulkWriter.delete(d.ref));
       qSnap.docs.forEach(d => bulkWriter.delete(d.ref));

       // If there are no more results/questions, delete the exam document itself
       if (resSnap.empty && qSnap.empty) {
          bulkWriter.delete(exam.ref);
       }
       await bulkWriter.close();

       // Keep repeating exams step until all exams and their sub-data are gone
       return NextResponse.json({ success: true, nextStep: "exams", cursor: undefined });
    }

    // STEP: FINALIZE
    if (step === "finalize") {
      await deleteDocumentAdmin("colleges", collegeId);
      await deleteStorageDirectory(`colleges/${collegeId}/`);
      return NextResponse.json({ success: true, done: true, message: "College deleted successfully." });
    }

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
