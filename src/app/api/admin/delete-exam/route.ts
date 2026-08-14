import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bulkDeleteByQuery, deleteDocumentAdmin } from '@/lib/services/cleanup-service';

const DeleteExamSchema = z.object({
  id: z.string().min(1, "Exam ID is required."),
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
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Permission denied." }, { status: 403 });
    }

    stage = "validatePayload";
    const body = await request.json().catch(() => ({}));
    const parseResult = await DeleteExamSchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: parseResult.error.issues[0].message }, { status: 400 });
    }
    const { id: examId } = parseResult.data;

    stage = "fetchExam";
    const examDoc = await prisma.exams.findUnique({ where: { id: examId }, select: { collegeId: true } });
    if (!examDoc) {
      return NextResponse.json({ success: false, stage, errorCode: "not-found", message: "Exam not found." }, { status: 404 });
    }

    // BOLA Check: If college_admin, ensure they only delete their own college's exams
    if (requesterRole === "college_admin") {
      const requesterCollegeId = requesterDoc?.collegeId;
      if (examDoc.collegeId !== requesterCollegeId) {
        return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "You can only delete exams belonging to your college." }, { status: 403 });
      }
    }

    stage = "cascadingDelete";
    // Delete all questions for this exam
    const deletedQuestions = await bulkDeleteByQuery("questions", "examId", "==", examId);
    
    // Delete all exam results for this exam
    const deletedResults = await bulkDeleteByQuery("exam_results", "examId", "==", examId);

    // Delete the exam document itself
    await deleteDocumentAdmin("exams", examId);

    return NextResponse.json({ 
      success: true, 
      message: "Exam completely deleted.",
      details: { deletedQuestions, deletedResults }
    });
  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
