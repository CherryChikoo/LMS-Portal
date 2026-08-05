import { type LucideIcon } from "lucide-react";

// Navigation
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  disabled?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// User
export type UserRole = "main_admin" | "college_admin" | "student" | "admin" | "trainer";
export type AccountStatus = "active" | "inactive" | "restricted" | "deleted";

export interface UserProfile {
  uid?: string;
  id?: string; // Legacy support
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  status?: AccountStatus;
  collegeId?: string;
  collegeName?: string;
  department?: string;
  academicYear?: string;
  section?: string;
  batchIds?: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface User extends UserProfile {}

// College
export interface CollegeBranding {
  companyName?: string;
  companySubtitle?: string;
  logoBase64?: string;
}

export interface College {
  id: string;
  name: string;
  type?: "official" | "external";
  code: string;
  departments: string[];
  location?: string;
  origin?: "trainer" | "self_registered" | "global";
  studentCount: number;
  adminEmail?: string;
  initialPassword?: string;
  loginEnabled?: boolean;
  status: AccountStatus;
  branding?: CollegeBranding;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isDeleted?: boolean;
  deletedAt?: Date;
}

// Student
export interface Student {
  id: string;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  collegeId: string;
  collegeName?: string;
  department?: string;
  academicYear?: string;
  semester?: number;
  section?: string;
  rollNumber?: string;
  enrollmentNo?: string;
  batchIds?: string[];
  batchId?: string;
  photoURL?: string;
  mustChangePassword?: boolean;
  initialPassword?: string;
  enrollmentType?: "csv" | "manual" | "self";
  status: AccountStatus;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isDeleted?: boolean;
  deletedAt?: Date;
}

export interface TrainerNote {
  id: string;
  studentId: string;
  text: string;
  authorName: string;
  createdAt: Date;
}

// Batch
export interface Batch {
  id: string;
  name: string;
  description?: string;
  collegeId: string;
  department?: string;
  academicYear: string;
  section?: string;
  studentIds?: string[];
  studentCount?: number;
  status: "active" | "archived";
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isDeleted?: boolean;
  deletedAt?: Date;
}

// Assignment Target
export type AssignmentTargetType = "college" | "department" | "year" | "section" | "batch" | "students" | "composite";

export interface AssignmentTarget {
  type: AssignmentTargetType;
  level?: string;
  ids: string[];
  names?: string[];
  // Composite filter fields (used when type === "composite")
  collegeId?: string;
  collegeName?: string;
  department?: string;
  academicYear?: string;
  section?: string;
  batchId?: string;
  batchName?: string;
  studentId?: string;
  studentName?: string;
}

// Resource
export interface Resource {
  id: string;
  title: string;
  description?: string;
  type: ResourceType;
  url: string;
  fileSize?: number;
  category: string;
  tags: string[];
  sharedWith: string[];
  targets?: AssignmentTarget[];
  collegeId?: string;
  collegeName?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ResourceType = "pdf" | "ppt" | "doc" | "video" | "image" | "link" | "zip" | "other";

export interface AIExplanation {
  overview: {
    summary: string;
    type: string;
    topic: string;
    subtopic: string;
    difficulty: string;
  };
  stepByStep: string;
  whyCorrect: string;
  whyIncorrect?: Record<string, string>;
  keyConcepts: string[];
  commonMistakes: string[];
  revisionNotes: string;
  relatedConcepts: string[];
  realWorldExample?: string;
  difficultyAnalysis: string;
  interviewPerspective?: string;
  learningObjective: string;
}

// Question
export interface Question {
  id: string;
  examId?: string;
  collegeId?: string;
  text: string;
  type?: QuestionType;
  options: string[];
  correctAnswer: number | string | string[];
  marks: number;
  explanation?: string;
  subject?: string;
  topic?: string;
  difficulty?: QuestionDifficulty;
  tags?: string[];
  aiExplanation?: AIExplanation;
  aiExplanationStatus?: "pending" | "generated" | "failed";
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type QuestionType = "mcq" | "true-false" | "short-answer" | "fill-blank";
export type QuestionDifficulty = "easy" | "medium" | "hard";

// Exam
export type ExamStatus = "draft" | "scheduled" | "active" | "completed" | "expired" | "cancelled";

export interface Exam {
  id: string;
  title: string;
  description?: string;
  collegeId: string;
  collegeName?: string;
  batchId?: string;
  durationMinutes: number;
  duration?: number; // legacy support
  totalMarks: number;
  passingMarks?: number;
  questionIds?: string[];
  questions?: Question[];
  targets?: AssignmentTarget[];
  scheduledAt?: string | Date;
  startTime?: Date;
  endTime?: Date;
  status: ExamStatus;
  settings?: ExamSettings;
  createdBy?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  deletedAt?: Date;
}

export interface ExamSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResults: boolean;
  allowReview: boolean;
  autoSubmit: boolean;
  proctoring: boolean;
}

// Result
export interface ExamResult {
  id: string;
  examId: string;
  examTitle?: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  collegeId?: string;
  collegeName?: string;
  score: number;
  totalMarks: number;
  percentage: number;
  passed?: boolean;
  status: "in_progress" | "submitted" | "graded";
  correctCount?: number;
  incorrectCount?: number;
  answers?: Record<string, string | string[]>;
  aiSummary?: string | Record<string, unknown>;
  submittedAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  timeTakenMinutes?: number;
  timeTaken?: number;
  startTime?: Date;
}

export type ExamAttempt = ExamResult;

// Student Question Palette State
export type QuestionPaletteState = "not_visited" | "not_answered" | "answered" | "marked_for_review" | "not-visited" | "unanswered" | "marked-for-review";

export interface StudentQuestionAnswer {
  questionId: string;
  selectedOption?: string | string[];
  paletteState: QuestionPaletteState;
  timeSpentSeconds?: number;
}

// CSV Student Import Types
export interface CSVStudentRow {
  studentName: string;
  collegeEmail: string;
  college: string;
  department: string;
  academicYear: string;
  section: string;
  batch: string;
}

export interface StudentImportCredential {
  name: string;
  email: string;
  password: string;
  status: "created" | "skipped" | "failed" | "duplicate";
  reason?: string;
}

export interface CSVImportSummary {
  total: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  duplicateCount: number;
  results: StudentImportCredential[];
}

// Doubt Discussion
export interface DoubtDiscussion {
  id: string;
  studentId: string;
  studentName: string;
  subject: string;
  topic?: string;
  resourceId?: string;
  resourceTitle?: string;
  question: string;
  reply?: string;
  repliedBy?: string;
  replies?: { id: string; authorId: string; authorName: string; role: string; text: string; createdAt: Date }[];
  status: "open" | "resolved";
  collegeId?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export type DoubtThread = DoubtDiscussion;

// Announcement
export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  targetAudience: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type AnnouncementPriority = "low" | "medium" | "high" | "urgent";

// Notification
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  actionUrl?: string;
  createdAt: Date;
}

export type NotificationType = "info" | "success" | "warning" | "error";

// Dashboard Stats
export interface DashboardStats {
  totalStudents: number;
  totalColleges: number;
  upcomingExams: number;
  totalResources: number;
  activeStudents: number;
  completedExams: number;
}

// Chart Data
export interface ChartDataPoint {
  name: string;
  value: number;
  fill?: string;
}

// Common
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SelectOption {
  label: string;
  value: string;
}
