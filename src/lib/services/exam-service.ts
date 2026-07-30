import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  where,
  serverTimestamp,
  subscribeToDocuments,
} from "@/lib/firebase/firestore";
import type { Exam, ExamResult, Student, ExamStatus, ExamAttempt } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";
import { toMillis } from "@/lib/utils/date";

const EXAMS_COLLECTION = "exams";
const RESULTS_COLLECTION = "exam_results";

export function subscribeToAllExams(callback: (exams: Exam[]) => void): () => void {
  return subscribeToDocuments<Exam>(EXAMS_COLLECTION, callback);
}

export function subscribeToAllAttempts(callback: (attempts: ExamAttempt[]) => void): () => void {
  return subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, callback);
}

export function subscribeToStudentAttempts(studentId: string, callback: (attempts: ExamAttempt[]) => void): () => void {
  return subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, callback, [where("studentId", "==", studentId)]);
}

export function subscribeToStudentAttemptsForUser(
  uid: string,
  profileId: string | undefined,
  email: string | undefined,
  callback: (attempts: ExamAttempt[]) => void
): () => void {
  const attemptsMap = new Map<string, ExamAttempt>();
  const unsubs: Array<() => void> = [];

  const update = () => {
    callback(Array.from(attemptsMap.values()));
  };

  if (uid) {
    unsubs.push(
      subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, (data) => {
        data.forEach((a) => attemptsMap.set(a.id, a));
        update();
      }, [where("studentId", "==", uid)])
    );
  }

  if (profileId && profileId !== uid) {
    unsubs.push(
      subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, (data) => {
        data.forEach((a) => attemptsMap.set(a.id, a));
        update();
      }, [where("studentId", "==", profileId)])
    );
  }

  const normEmail = (email || "").toLowerCase().trim();
  if (normEmail) {
    unsubs.push(
      subscribeToDocuments<ExamAttempt>(RESULTS_COLLECTION, (data) => {
        data.forEach((a) => attemptsMap.set(a.id, a));
        update();
      }, [where("studentEmail", "==", normEmail)])
    );
  }

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}

export function subscribeToLeaderboardAttempts(
  collegeId: string | undefined | null,
  callback: (attempts: ExamAttempt[]) => void
): () => void {
  return subscribeToAllAttempts(callback);
}

export async function getAllExams(): Promise<Exam[]> {
  return getDocuments<Exam>(EXAMS_COLLECTION);
}

export async function getAllExamsIncludingDeleted(): Promise<Exam[]> {
  return getDocuments<Exam>(EXAMS_COLLECTION, [], true);
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
  // Hard delete the exam and all associated results
  const results = await getResultsByExam(id);
  if (results.length > 0) {
    await Promise.all(results.map(r => deleteDocument(RESULTS_COLLECTION, r.id)));
  }
  return deleteDocument(EXAMS_COLLECTION, id);
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
  return exams.filter((exam) => {
    return isAssignedToStudent(exam.targets, student);
  });
}

// Results
export async function getResultsByExam(examId: string): Promise<ExamResult[]> {
  return getDocuments<ExamResult>(RESULTS_COLLECTION, [where("examId", "==", examId)]);
}

export async function getResultsByStudent(studentId: string): Promise<ExamResult[]> {
  return getDocuments<ExamResult>(RESULTS_COLLECTION, [where("studentId", "==", studentId)]);
}

export async function getStudentAttempts(studentId?: string): Promise<ExamResult[]> {
  if (studentId) {
    return getResultsByStudent(studentId);
  }
  return getDocuments<ExamResult>(RESULTS_COLLECTION);
}

/**
 * Fetch attempts for the currently signed-in student by uid and email.
 * Firestore studentId may be stored as the Firebase uid or as the email,
 * so both queries are executed and de-duplicated by attempt id.
 */
export async function getStudentAttemptsForCurrentUser(
  uid: string,
  email?: string,
  profileId?: string
): Promise<ExamResult[]> {
  const attempts = new Map<string, ExamResult>();

  if (uid) {
    try {
      const byId = await getDocuments<ExamResult>(RESULTS_COLLECTION, [
        where("studentId", "==", uid),
      ]);
      byId.forEach((a) => attempts.set(a.id, a));
    } catch (err) {
      console.error("[Firestore Index / Query Failure - Check Console Link]:", err);
    }
  }

  if (profileId && profileId !== uid) {
    try {
      const byProfileId = await getDocuments<ExamResult>(RESULTS_COLLECTION, [
        where("studentId", "==", profileId),
      ]);
      byProfileId.forEach((a) => attempts.set(a.id, a));
    } catch (err) {
      console.error("[Firestore Index / Query Failure - Check Console Link]:", err);
    }
  }

  const normalizedEmail = (email || "").toLowerCase().trim();
  if (normalizedEmail) {
    if (normalizedEmail !== uid.toLowerCase()) {
      try {
        const byEmail = await getDocuments<ExamResult>(RESULTS_COLLECTION, [
          where("studentId", "==", normalizedEmail),
        ]);
        byEmail.forEach((a) => attempts.set(a.id, a));
      } catch (err) {
        console.error("[Firestore Index / Query Failure - Check Console Link]:", err);
      }
    }

    try {
      const byStudentEmailField = await getDocuments<ExamResult>(RESULTS_COLLECTION, [
        where("studentEmail", "==", normalizedEmail),
      ]);
      byStudentEmailField.forEach((a) => attempts.set(a.id, a));
    } catch (err) {
      console.error("[Firestore Index / Query Failure - Check Console Link]:", err);
    }
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
  const results = await getDocuments<ExamResult>(RESULTS_COLLECTION);
  await Promise.all(results.map((r) => deleteDocument(RESULTS_COLLECTION, r.id)));
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
