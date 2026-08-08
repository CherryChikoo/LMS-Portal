import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  where,
  serverTimestamp,
  subscribeToDocuments,
  type QueryOptions,
  type PaginatedResult,
} from "@/lib/firebase/firestore";
import { auth } from "@/lib/firebase/config";
import { orderBy } from "firebase/firestore";
import type { Exam, ExamResult, Student, ExamStatus, ExamAttempt } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";
import { toMillis } from "@/lib/utils/date";

const EXAMS_COLLECTION = "exams";
const RESULTS_COLLECTION = "exam_results";

export function subscribeToAllExams(callback: (exams: Exam[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<Exam>(EXAMS_COLLECTION, callback, [], false, options);
}

export function subscribeToExamsByCollege(collegeId: string, callback: (exams: Exam[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<Exam>(EXAMS_COLLECTION, callback, [where("collegeId", "==", collegeId)], false, options);
}

export function subscribeToPublishedExamsByCollege(collegeId: string, callback: (exams: Exam[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<Exam>(EXAMS_COLLECTION, callback, [
    where("collegeId", "==", collegeId),
    where("status", "!=", "draft")
  ], false, options);
}

export function subscribeToAllAttempts(callback: (attempts: ExamAttempt[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, callback, [], false, options);
}

export function subscribeToAttemptsByCollege(collegeId: string, callback: (attempts: ExamAttempt[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, callback, [where("collegeId", "==", collegeId)], false, options);
}

export function subscribeToStudentAttempts(studentId: string, callback: (attempts: ExamAttempt[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, callback, [where("studentId", "==", studentId)], false, options);
}

export function subscribeToStudentAttemptsForUser(
  uid: string,
  profileId: string | undefined,
  _email: string | undefined,
  callback: (attempts: ExamAttempt[]) => void,
  options?: QueryOptions
): () => void {
  const attemptsMap = new Map<string, ExamAttempt>();
  const unsubs: Array<() => void> = [];

  const update = () => {
    callback(Array.from(attemptsMap.values()));
  };

  const targetUid = uid || profileId;

  if (targetUid) {
    unsubs.push(
      subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, (data) => {
        attemptsMap.clear();
        data.forEach((a) => attemptsMap.set(a.id, a));
        update();
      }, [where("studentId", "==", targetUid)], false, options)
    );
  }

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}

export function subscribeToLeaderboardAttempts(
  collegeId: string | undefined | null,
  callback: (attempts: ExamAttempt[]) => void,
  options?: QueryOptions
): () => void {
  // OPTIMIZATION: Previously fetched all attempts globally for leaderboard.
  // Now scoped to collegeId to dramatically reduce reads for students.
  if (collegeId && collegeId !== "global") {
    return subscribeToAttemptsByCollege(collegeId, callback, options);
  }
  // Fallback for admin/trainer without collegeId: still use subscribeToAllAttempts
  // but with a limit applied via options
  return subscribeToAllAttempts(callback, options);
}

export async function getAllExams(options?: QueryOptions): Promise<PaginatedResult<Exam>> {
  return getDocuments<Exam>(
    EXAMS_COLLECTION,
    [orderBy("createdAt", "desc")],
    false,
    { pageSize: options?.pageSize ?? 1000, ...options }
  );
}

export async function getAllExamsIncludingDeleted(options?: QueryOptions): Promise<PaginatedResult<Exam>> {
  return getDocuments<Exam>(
    EXAMS_COLLECTION,
    [orderBy("createdAt", "desc")],
    true,
    { pageSize: options?.pageSize ?? 1000, ...options }
  );
}

export async function getExamById(id: string): Promise<Exam | null> {
  const exam = await getDocument<Exam>(EXAMS_COLLECTION, id);
  if (exam?.deletedAt) return null;
  return exam;
}

export async function createExam(data: Omit<Exam, "id">): Promise<string> {
  return addDocument<Exam>(EXAMS_COLLECTION, data);
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<void> {
  return updateDocument<Exam>(EXAMS_COLLECTION, id, data);
}

export async function deleteExam(id: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to delete exam");
  
  const token = await user.getIdToken();
  const res = await fetch("/api/admin/delete-exam", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ id })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to delete exam via Admin API");
  }
}

export async function expireExam(id: string): Promise<void> {
  return updateDocument<Exam>(EXAMS_COLLECTION, id, {
    status: "expired",
  });
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

/**
 * Filter exams assigned to a specific student based on hierarchy or direct student target.
 */
export function filterExamsForStudent(exams: Exam[], student: Student): Exam[] {
  const studentCreatedMillis = toMillis(student.createdAt) ?? 0;

  return exams.filter((exam) => {
    if (!isAssignedToStudent(exam.targets, student)) return false;

    // A newly created student shouldn't see exams from the past that were created before they existed.
    // If the exam is active/scheduled, they should see it regardless.
    const examCreatedMillis = toMillis(exam.createdAt) ?? 0;
    const wasCreatedBeforeStudent = examCreatedMillis > 0 && studentCreatedMillis > 0 && examCreatedMillis < studentCreatedMillis;

    if (wasCreatedBeforeStudent) {
      const eff = getEffectiveExamStatus(exam);
      if (eff === "expired" || eff === "completed" || eff === "cancelled") {
        return false;
      }
    }

    return true;
  });
}

// Results
export async function getResultsByExam(examId: string, options?: QueryOptions, collegeId?: string): Promise<PaginatedResult<ExamResult>> {
  const constraints = [where("examId", "==", examId)];
  if (collegeId && collegeId !== "ALL" && collegeId !== "global") {
    constraints.push(where("collegeId", "==", collegeId));
  }
  return getDocuments<ExamResult>(RESULTS_COLLECTION, constraints, false, options);
}

export async function getResultsByStudent(studentId: string): Promise<ExamResult[]> {
  const res = await getDocuments<ExamResult>(RESULTS_COLLECTION, [where("studentId", "==", studentId)]);
  return res.data;
}

export async function getStudentAttempts(studentId?: string): Promise<ExamResult[]> {
  if (studentId) {
    return getResultsByStudent(studentId);
  }
  const res = await getDocuments<ExamResult>(RESULTS_COLLECTION);
  return res.data;
}

export async function getStudentAttemptsForCurrentUser(
  uid: string,
  _email?: string
): Promise<ExamResult[]> {
  if (!uid) return [];
  const attempts = new Map<string, ExamResult>();

  try {
    const byStudentId = await getDocuments<ExamResult>(RESULTS_COLLECTION, [
      where("studentId", "==", uid),
    ]);
    byStudentId.data.forEach((a) => attempts.set(a.id, a));
  } catch (err) {
    console.error("[Firestore Index / Query Failure - Check Console Link]:", err);
  }

  return Array.from(attempts.values());
}

export async function submitExamResult(data: Omit<ExamResult, "id">): Promise<string> {
  return addDocument<ExamResult>(RESULTS_COLLECTION, data);
}

export async function submitExamAttempt(data: Omit<ExamResult, "id">): Promise<string> {
  return submitExamResult(data);
}

export async function deleteResultById(id: string): Promise<void> {
  return deleteDocument(RESULTS_COLLECTION, id);
}

export async function clearAllResults(): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Unauthorized");

  const res = await fetch("/api/admin/clear-all-results", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to clear results");
  }
}

/**
 * Find a student's attempt for a given exam from a pre-fetched attempts array.
 * Matches by uid, email, or name (case-insensitive). This is a pure synchronous
 * filter — no Firebase calls.
 */
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
