import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  where,
} from "@/lib/firebase/firestore";
import type { Exam, ExamResult, Student, ExamStatus } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";

const EXAMS_COLLECTION = "exams";
const RESULTS_COLLECTION = "exam_results";

export async function getAllExams(): Promise<Exam[]> {
  return getDocuments<Exam>(EXAMS_COLLECTION);
}

export async function getExamById(id: string): Promise<Exam | null> {
  return getDocument<Exam>(EXAMS_COLLECTION, id);
}

export async function createExam(data: Omit<Exam, "id">): Promise<string> {
  return addDocument<Exam>(EXAMS_COLLECTION, data);
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<void> {
  return updateDocument<Exam>(EXAMS_COLLECTION, id, data);
}

export async function deleteExam(id: string): Promise<void> {
  return deleteDocument(EXAMS_COLLECTION, id);
}

export function getEffectiveExamStatus(exam: Exam): ExamStatus {
  if (exam.status === "draft" || exam.status === "cancelled") return exam.status;
  
  const now = new Date().getTime();
  const startTime = exam.startTime ? new Date(exam.startTime).getTime() : (exam.scheduledAt ? new Date(exam.scheduledAt).getTime() : null);
  const endTime = exam.endTime ? new Date(exam.endTime).getTime() : null;

  if (startTime && now < startTime) {
    return "scheduled";
  }
  if (endTime && now > endTime) {
    return "completed";
  }
  return "active";
}

/**
 * Filter exams assigned to a specific student based on hierarchy or direct student target
 */
export function filterExamsForStudent(exams: Exam[], student: Student): Exam[] {
  return exams.filter((exam) => isAssignedToStudent(exam.targets, student));
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
