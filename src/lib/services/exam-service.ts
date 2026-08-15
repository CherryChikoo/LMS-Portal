import { supabase } from "@/lib/supabase/client";
import { globalLoading } from "@/providers/global-loading-provider";
import { refreshCache, optimisticAddExamToCache, optimisticUpdateExamInCache, optimisticDeleteExamFromCache } from "@/lib/data/lms-data-cache";
import type { Exam, ExamResult, Student, ExamStatus, ExamAttempt } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";
import { toMillis } from "@/lib/utils/date";
import {
  getAllExamsAction,
  getAllExamsIncludingDeletedAction,
  getExamByIdAction,
  createExamAction,
  updateExamAction,
  getResultsByExamAction,
  getResultsByStudentAction,
  getStudentAttemptsAction,
  getStudentAttemptsForCurrentUserAction,
  submitExamResultAction,
  deleteResultByIdAction
} from "@/lib/actions/exam-actions";

export async function getAllExams(): Promise<{ data: Exam[], lastDoc: any }> {
  const data = await getAllExamsAction();
  const parsedData = JSON.parse(JSON.stringify(data));
  return { data: parsedData as Exam[], lastDoc: parsedData.length > 0 ? parsedData[parsedData.length - 1] : null };
}

export async function getAllExamsIncludingDeleted(): Promise<{ data: Exam[], lastDoc: any }> {
  const data = await getAllExamsIncludingDeletedAction();
  const parsedData = JSON.parse(JSON.stringify(data));
  return { data: parsedData as Exam[], lastDoc: parsedData.length > 0 ? parsedData[parsedData.length - 1] : null };
}

export async function getExamById(id: string): Promise<Exam | null> {
  const data = await getExamByIdAction(id);
  if (!data) return null;
  const exam = JSON.parse(JSON.stringify(data)) as Exam;
  if (exam.deletedAt) return null;
  return exam;
}

export async function createExam(data: Omit<Exam, "id">): Promise<string> {
  return await globalLoading.wrap(async () => {
    const id = await createExamAction(data);
    try {
      optimisticAddExamToCache({ id, ...data } as Exam);
      refreshCache().catch(() => {});
    } catch (_) {}
    return id;
  }, `Publishing assessment "${data.title}"...`);
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<void> {
  return await globalLoading.wrap(async () => {
    try {
      optimisticUpdateExamInCache(id, data);
    } catch (_) {}
    await updateExamAction(id, data);
    try {
      refreshCache().catch(() => {});
    } catch (_) {}
  }, "Updating assessment details...");
}

export async function deleteExam(id: string): Promise<void> {
  return await globalLoading.wrap(async () => {
    try {
      optimisticDeleteExamFromCache(id);
    } catch (_) {}

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) throw new Error("Must be logged in to delete exam");
    
    const res = await fetch("/api/admin/delete-exam", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ id })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to delete exam via Admin API");
    }

    try {
      refreshCache().catch(() => {});
    } catch (_) {}
  }, "Deleting assessment...");
}

export async function expireExam(id: string): Promise<void> {
  return await globalLoading.wrap(async () => {
    await updateExam(id, { status: "expired" });
  }, "Closing assessment...");
}

export function getEffectiveExamStatus(exam: Exam): ExamStatus {
  if (exam.status === "draft" || exam.status === "cancelled" || exam.status === "expired" || exam.status === "completed") return exam.status;

  const now = new Date().getTime();
  const startTime = toMillis(exam.startTime) ?? toMillis(exam.scheduledAt);
  const endTime = toMillis(exam.endTime);

  if (startTime !== null && now < startTime) {
    return "scheduled";
  }
  if (endTime !== null && now > endTime) {
    return "expired";
  }
  return "active";
}

export function filterExamsForStudent(exams: Exam[], student: Student): Exam[] {
  return exams.filter((exam) => {
    return isAssignedToStudent(exam.targets, student, (exam as any).sharedWith);
  });
}

export async function getResultsByExam(examId: string, collegeId?: string): Promise<{ data: ExamResult[], lastDoc: any }> {
  const data = await getResultsByExamAction(examId, collegeId);
  const parsedData = JSON.parse(JSON.stringify(data));
  return { data: parsedData as ExamResult[], lastDoc: parsedData.length > 0 ? parsedData[parsedData.length - 1] : null };
}

export async function getResultsByStudent(studentId: string): Promise<ExamResult[]> {
  const data = await getResultsByStudentAction(studentId);
  return JSON.parse(JSON.stringify(data)) as ExamResult[];
}

export async function getStudentAttempts(studentId?: string): Promise<ExamResult[]> {
  const data = await getStudentAttemptsAction(studentId);
  return JSON.parse(JSON.stringify(data)) as ExamResult[];
}

export async function getStudentAttemptsForCurrentUser(
  uid: string,
  _email?: string
): Promise<ExamResult[]> {
  const data = await getStudentAttemptsForCurrentUserAction(uid);
  return JSON.parse(JSON.stringify(data)) as ExamResult[];
}

export async function submitExamResult(data: Omit<ExamResult, "id">): Promise<string> {
  return await submitExamResultAction(data);
}

export async function submitExamAttempt(data: Omit<ExamResult, "id">): Promise<string> {
  return await submitExamResultAction(data);
}

export async function deleteResultById(id: string): Promise<void> {
  await deleteResultByIdAction(id);
}

export async function clearAllResults(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error("Unauthorized");

  const res = await fetch("/api/admin/clear-all-results", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to clear results");
  }
}

export function isAttemptOwnedByStudent(
  att: ExamResult | ExamAttempt,
  student: { id?: string; email?: string; name?: string; uid?: string } | null
): boolean {
  if (!att || !student) return false;

  const sId = (student.id || "").toLowerCase().trim();
  const sUid = (((student as any).uid || "") as string).toLowerCase().trim();
  const sEmail = (student.email || "").toLowerCase().trim();
  const sName = (student.name || "").toLowerCase().trim();

  const attId = (att.studentId || "").toLowerCase().trim();
  const attEmail = (((att as any).studentEmail || "") as string).toLowerCase().trim();
  const attName = (att.studentName || "").toLowerCase().trim();

  if (sId && (attId === sId || attEmail === sId)) return true;
  if (sUid && (attId === sUid || attEmail === sUid)) return true;
  if (sEmail && (attId === sEmail || attEmail === sEmail)) return true;
  if (sName && attName && attName === sName && attName !== "student") return true;

  return false;
}

export function findStudentAttemptForExam(
  attempts: ExamResult[],
  examId: string,
  student: { id?: string; email?: string; name?: string; uid?: string } | null
): ExamResult | undefined {
  if (!student) return undefined;
  return attempts.find((a) => a.examId === examId && isAttemptOwnedByStudent(a, student));
}
