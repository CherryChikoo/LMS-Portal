"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Edit3,
  Eye,
  FileText,
  GraduationCap,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { QuestionReview } from "@/components/assessment/question-review";

import {
  getAllBatches,
  getAllColleges,
  getAllStudents,
  getEffectiveExamStatus,
  getExamById,
  getResultsByExam,
  getStudentAttemptsForCurrentUser,
  getStudentById,
  getStudentByEmail,
} from "@/lib/services";
import { isAssignedToStudent } from "@/lib/services/assignment-engine";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { formatTimestamp, toMillis } from "@/lib/utils/date";
import { useLMSData } from "@/lib/data/use-lms-data";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";

import type {
  AssignmentTarget,
  Batch,
  College,
  Exam,
  ExamResult,
  Student,
} from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

function resolveRoleFromStorage(): string {
  if (typeof window === "undefined") return "admin";
  try {
    const storedRole = localStorage.getItem("lms_role");
    if (storedRole) return storedRole.toLowerCase();

    const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
    if (uStr) {
      const parsed = JSON.parse(uStr);
      if (parsed && typeof parsed.role === "string") {
        return parsed.role.toLowerCase();
      }
    }
  } catch {
    // Ignore corrupt storage and fall back to admin
  }
  return "admin";
}

function isAdminLikePath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/admin");
}

function getBackHref(): string {
  return isAdminLikePath() ? "/admin/exams" : "/exams";
}

function getAnswerSheetHref(attemptId: string): string {
  return isAdminLikePath() ? `/admin/results/${attemptId}` : `/results/${attemptId}`;
}

function formatDateTime(value: unknown): string {
  const formatted = formatTimestamp(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatted ?? "Live Active";
}

function formatDateOnly(value: unknown): string {
  const formatted = formatTimestamp(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return formatted ?? "—";
}



interface AssignedStat {
  totalAssigned: number;
  totalAttempted: number;
  totalPending: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passPercentage: number;
}

function computeStats(exam: Exam, attempts: ExamResult[], students: Student[]): AssignedStat {
  const submittedAttempts = attempts.filter((a) => a.status === "submitted" || (a.answers && Object.keys(a.answers).length > 0));

  let totalAssigned = 0;
  if (!exam.targets || exam.targets.length === 0) {
    totalAssigned = students.length;
  } else {
    totalAssigned = students.filter((s) => isAssignedToStudent(exam.targets, s)).length;
  }

  const totalAttempted = submittedAttempts.length;
  const totalPending = Math.max(0, totalAssigned - totalAttempted);

  const percentages = submittedAttempts
    .map((a) => (typeof a.percentage === "number" ? a.percentage : 0));

  const averageScore = percentages.length > 0
    ? Math.round(percentages.reduce((sum, p) => sum + p, 0) / percentages.length)
    : 0;
  const highestScore = percentages.length > 0 ? Math.max(...percentages) : 0;
  const lowestScore = percentages.length > 0 ? Math.min(...percentages) : 0;
  const passedCount = submittedAttempts.filter((a) => a.passed === true).length;
  const passPercentage = submittedAttempts.length > 0
    ? Math.round((passedCount / submittedAttempts.length) * 100)
    : 0;

  return {
    totalAssigned,
    totalAttempted,
    totalPending,
    averageScore,
    highestScore,
    lowestScore,
    passPercentage,
  };
}

function isAllWildcard(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "all" || normalized === "global";
}

interface GroupedTargets {
  colleges: { id: string; name: string }[];
  departments: string[];
  years: string[];
  sections: string[];
  batches: { id: string; name: string }[];
  students: { id: string; name: string }[];
  isGlobal: boolean;
}

function groupTargets(targets: AssignmentTarget[] | undefined, students: Student[], resolveInstitution: (id: string) => string, resolveBatch: (id: string) => string, resolveStudent: (id: string) => string): GroupedTargets {
  const colleges = new Map<string, string>();
  const departments = new Set<string>();
  const years = new Set<string>();
  const sections = new Set<string>();
  const batches = new Map<string, string>();
  const selectedStudents = new Map<string, string>();

  if (!targets || targets.length === 0) {
    return {
      colleges: [],
      departments: [],
      years: [],
      sections: [],
      batches: [],
      students: [],
      isGlobal: true,
    };
  }

  let allWildcard = true;

  for (const target of targets) {
    const type = (target.type || "").toLowerCase();

    if (type === "composite") {
      if (!isAllWildcard(target.collegeId) || !isAllWildcard(target.collegeName)) {
        const id = target.collegeId || target.collegeName || "";
        const name = resolveInstitution(id);
        colleges.set(id, name);
        allWildcard = false;
      }
      if (!isAllWildcard(target.department)) {
        departments.add(target.department as string);
        allWildcard = false;
      }
      if (!isAllWildcard(target.academicYear)) {
        years.add(target.academicYear as string);
        allWildcard = false;
      }
      if (!isAllWildcard(target.section)) {
        sections.add(target.section as string);
        allWildcard = false;
      }
      if (!isAllWildcard(target.batchId) || !isAllWildcard(target.batchName)) {
        const id = target.batchId || target.batchName || "";
        const name = resolveBatch(id);
        batches.set(id, name);
        allWildcard = false;
      }
      continue;
    }

    if (type === "college") {
      (target.ids || []).forEach((id) => {
        if (isAllWildcard(id)) return;
        colleges.set(id, resolveInstitution(id));
        allWildcard = false;
      });
      continue;
    }

    if (type === "department") {
      (target.ids || []).forEach((id) => {
        if (isAllWildcard(id)) return;
        departments.add(id);
        allWildcard = false;
      });
      continue;
    }

    if (type === "year") {
      (target.ids || []).forEach((id) => {
        if (isAllWildcard(id)) return;
        years.add(id);
        allWildcard = false;
      });
      continue;
    }

    if (type === "section") {
      (target.ids || []).forEach((id) => {
        if (isAllWildcard(id)) return;
        sections.add(id);
        allWildcard = false;
      });
      continue;
    }

    if (type === "batch") {
      (target.ids || []).forEach((id) => {
        if (isAllWildcard(id)) return;
        batches.set(id, resolveBatch(id));
        allWildcard = false;
      });
      continue;
    }

    if (type === "students") {
      (target.ids || []).forEach((id) => {
        if (isAllWildcard(id)) return;
        selectedStudents.set(id, resolveStudent(id));
        allWildcard = false;
      });
      continue;
    }
  }

  return {
    colleges: Array.from(colleges.entries()).map(([id, name]) => ({ id, name })),
    departments: Array.from(departments),
    years: Array.from(years),
    sections: Array.from(sections),
    batches: Array.from(batches.entries()).map(([id, name]) => ({ id, name })),
    students: Array.from(selectedStudents.entries()).map(([id, name]) => ({ id, name })),
    isGlobal: allWildcard,
  };
}

export default function ExamDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();

  const { filteredColleges: colleges, filteredBatches: batches, filteredStudents: students, loading: globalLoading } = useLMSData();
  const { resolveInstitution, resolveBatch, resolveStudent } = useEntityResolution();
  
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualRole] = useState<string>(() => {
    if (typeof window === "undefined") return "admin";
    try {
      return resolveRoleFromStorage();
    } catch {
      return "admin";
    }
  });
  const [studentUser, setStudentUser] = useState<Student | null>(null);
  const [studentChecked, setStudentChecked] = useState(false);
  const [nowMs] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    return Date.now();
  });

  const [attempts, setAttempts] = useState<ExamResult[]>([]);

  useEffect(() => {
    const role = resolveRoleFromStorage();

    async function load() {
      setLoading(true);
      try {
        const id = resolvedParams.id;
        const examData = await getExamById(id);
        setExam(examData);

        if (role === "student") {
          const me = await getCurrentUser();
          if (me) {
            let studProfile = me.uid ? await getStudentById(me.uid) : null;
            if (!studProfile && me.email) {
              studProfile = await getStudentByEmail(me.email);
            }
            if (studProfile) {
              setStudentUser(studProfile);
            } else {
              // Fallback to minimal profile if Firestore fetch fails but auth exists
              setStudentUser({
                id: me.uid,
                name: me.profile?.name as string || me.profile?.displayName as string || "",
                email: me.email,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as Student);
            }
            if (examData) {
              try {
                const studentAttempts = await getStudentAttemptsForCurrentUser(me.uid, me.email);
                const submitted = studentAttempts.find(
                  (a) => a.examId === examData.id && (a.status === "submitted" || (a.answers && Object.keys(a.answers).length > 0)),
                );
                if (submitted) {
                  router.replace(`/student/exams/${id}/review`);
                  return;
                }
              } catch (err) {
                console.error("Failed to check existing attempts", err);
              }
            }
          }
        } else {
          const attData = await getResultsByExam(id);
          setAttempts(attData || []);
        }
      } catch (err) {
        console.error("Failed to load exam details", err);
      } finally {
        setLoading(false);
        setStudentChecked(true);
      }
    }
    load();
  }, [resolvedParams.id, router]);

  if (loading || globalLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <span className="text-sm font-semibold text-muted-foreground">Loading assessment details...</span>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={ClipboardList}
          title="Assessment Not Found"
          description="The requested assessment does not exist or has been removed by the trainer."
          actionLabel="Back to Examinations"
          onAction={() => router.push(getBackHref())}
        />
      </div>
    );
  }

  if (actualRole === "student") {
    return (
      <StudentExamDetails
        exam={exam}
        studentUser={studentUser}
        studentChecked={studentChecked}
        nowMs={nowMs}
      />
    );
  }

  return (
    <TrainerExamDetails
      exam={exam}
      attempts={attempts}
      students={students}
      colleges={colleges}
      batches={batches}
      resolveInstitution={resolveInstitution}
      resolveBatch={resolveBatch}
      resolveStudent={resolveStudent}
    />
  );
}

interface StudentDetailsProps {
  exam: Exam;
  studentUser: Student | null;
  studentChecked: boolean;
  nowMs: number | null;
}

function StudentExamDetails({ exam, studentUser, studentChecked, nowMs }: StudentDetailsProps) {
  const router = useRouter();

  const isAssigned = useMemo(() => {
    if (!studentChecked) return true;
    if (!studentUser) return false;
    return filterExamsForStudentLocal(exam, studentUser);
  }, [exam, studentUser, studentChecked]);

  if (studentChecked && !isAssigned) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={ShieldCheck}
          title="Assessment Not Assigned"
          description="This evaluation is not assigned to your batch or academic hierarchy. Please contact your trainer if you believe this is an error."
          actionLabel="Back to Examinations"
          onAction={() => router.push("/student/exams")}
        />
      </div>
    );
  }

  const effStatus = getEffectiveExamStatus(exam);
  const now = nowMs ?? 0;
  const startMs = toMillis(exam.startTime) ?? toMillis(exam.scheduledAt);
  const endMs = toMillis(exam.endTime);
  const inWindow =
    (startMs === null || now >= startMs) && (endMs === null || now <= endMs);
  const canStart = effStatus === "active" && inWindow;

  const passingPercentage = exam.totalMarks > 0
    ? (exam.passingMarks > exam.totalMarks
        ? Math.min(100, exam.passingMarks)
        : Math.round((exam.passingMarks / exam.totalMarks) * 100))
    : 0;
  const effectivePassingMarks = exam.totalMarks > 0
    ? (exam.passingMarks > exam.totalMarks
        ? Math.round((exam.totalMarks * Math.min(100, exam.passingMarks)) / 100)
        : exam.passingMarks)
    : 0;

  const startTimeStr = formatDateTime(exam.startTime ?? exam.scheduledAt);
  const endTimeStr = formatDateTime(exam.endTime);
  const assignedBy = exam.createdBy || "Institution";

  const statusBadge = buildStatusBadge(effStatus);
  const startDisabledReason = !canStart ? buildDisabledReason(effStatus, startMs, endMs) : null;

  const totalQuestions = exam.questions?.length ?? exam.questionIds?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examination Briefing"
        description="Review the assessment overview carefully before launching your secure proctored examination."
        actions={
          <Button
            onClick={() => router.push("/student/exams")}
            variant="outline"
            className="border-border"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Examinations
          </Button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-5">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${statusBadge.className}`}>
                {statusBadge.label}
              </span>
              {exam.settings?.proctoring && (
                <span className="px-3 py-1 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold text-[11px] uppercase tracking-wider">
                  Proctored
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">
              {exam.title}
            </h2>
            {exam.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{exam.description}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <InfoTile
            icon={BookOpen}
            label="Subject"
            value={exam.questions?.[0]?.subject || "General"}
          />
          <InfoTile
            icon={Clock}
            label="Duration"
            value={`${exam.duration || 0} minutes`}
          />
          <InfoTile
            icon={FileText}
            label="Total Questions"
            value={`${totalQuestions} questions`}
          />
          <InfoTile
            icon={Award}
            label="Total Marks"
            value={`${exam.totalMarks} marks`}
          />
          <InfoTile
            icon={Target}
            label="Passing Criteria"
            value={`${effectivePassingMarks} marks / ${passingPercentage}%`}
          />
          <InfoTile
            icon={UserCheck}
            label="Assigned By"
            value={assignedBy}
          />
          <InfoTile
            icon={Calendar}
            label="Start Time"
            value={startTimeStr}
          />
          <InfoTile
            icon={Calendar}
            label="End Time"
            value={endTimeStr}
          />
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand" />
            Instructions
          </h3>
          <ul className="text-sm text-foreground leading-relaxed list-disc list-inside space-y-1.5">
            <li>Read every question carefully before selecting your answer.</li>
            <li>The assessment will run in fullscreen mode once you begin; do not exit fullscreen or switch tabs.</li>
            <li>Your responses are auto-saved as you navigate between questions.</li>
            <li>You can mark questions for review and return to them before final submission.</li>
            <li>The exam will auto-submit when the timer reaches zero.</li>
          </ul>
        </div>

        {startDisabledReason && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold leading-relaxed">{startDisabledReason}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            By starting this assessment you confirm you have read the instructions and are ready to begin.
          </p>
          <Button
            onClick={() => router.push(`/student/exams/${exam.id}/take`)}
            disabled={!canStart}
            className="bg-brand hover:bg-brand/90 text-brand-foreground font-bold h-11 px-6 rounded-xl shadow-md flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-white" />
            Start Assessment
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function filterExamsForStudentLocal(exam: Exam, student: Student): boolean {
  if (!exam.targets || exam.targets.length === 0) return true;
  return isAssignedToStudent(exam.targets, student);
}

function buildDisabledReason(
  status: string,
  startMs: number | null,
  endMs: number | null,
): string {
  const now = Date.now();
  if (status === "scheduled" && startMs !== null && now < startMs) {
    return "This assessment has not opened yet. The Start button will activate once the scheduled window begins.";
  }
  if (status === "expired" || status === "completed" || (endMs !== null && now > endMs)) {
    return "This assessment window has closed. Contact your trainer if you believe this is in error.";
  }
  if (status === "draft" || status === "cancelled") {
    return "This assessment is not currently available for student attempts.";
  }
  return "The Start button is currently disabled. Please contact your trainer if this persists.";
}

interface InfoTileProps {
  icon: typeof Clock;
  label: string;
  value: string;
}

function InfoTile({ icon: Icon, label, value }: InfoTileProps) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="w-4 h-4 text-brand" />
        <span>{label}</span>
      </div>
      <p className="text-base font-extrabold text-foreground leading-tight">{value}</p>
    </div>
  );
}

interface StatusBadgeStyle {
  label: string;
  className: string;
}

function buildStatusBadge(status: string): StatusBadgeStyle {
  if (status === "active") {
    return {
      label: "Live Now",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    };
  }
  if (status === "scheduled") {
    return {
      label: "Scheduled",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
    };
  }
  if (status === "completed") {
    return {
      label: "Completed",
      className: "bg-blue-500/15 text-blue-500 border border-blue-500/30",
    };
  }
  if (status === "expired") {
    return {
      label: "Expired",
      className: "bg-rose-500/15 text-rose-500 border border-rose-500/30",
    };
  }
  if (status === "cancelled") {
    return {
      label: "Cancelled",
      className: "bg-destructive/15 text-destructive border border-destructive/30",
    };
  }
  return {
    label: "Draft",
    className: "bg-muted text-muted-foreground border border-border",
  };
}

interface TrainerDetailsProps {
  exam: Exam;
  attempts: ExamResult[];
  students: Student[];
  colleges: College[];
  batches: Batch[];
  resolveInstitution: (id: string) => string;
  resolveBatch: (id: string) => string;
  resolveStudent: (id: string) => string;
}

function TrainerExamDetails({
  exam,
  attempts,
  students,
  colleges,
  batches,
  resolveInstitution,
  resolveBatch,
  resolveStudent,
}: TrainerDetailsProps) {
  const router = useRouter();


  const missingAiCount = useMemo(() => {
    if (!exam || !exam.questions) return 0;
    return exam.questions.filter(q => !q.aiExplanation).length;
  }, [exam]);

  const stats = useMemo(
    () => computeStats(exam, attempts, students),
    [exam, attempts, students],
  );

  const groupedTargets = useMemo(
    () => groupTargets(exam.targets, students, resolveInstitution, resolveBatch, resolveStudent),
    [exam.targets, students, resolveInstitution, resolveBatch, resolveStudent],
  );

  const effStatus = getEffectiveExamStatus(exam);
  const statusBadge = buildStatusBadge(effStatus);

  const totalQuestions = exam.questions?.length ?? exam.questionIds?.length ?? 0;
  const passingPercentage = exam.totalMarks > 0
    ? (exam.passingMarks > exam.totalMarks
        ? Math.min(100, exam.passingMarks)
        : Math.round((exam.passingMarks / exam.totalMarks) * 100))
    : 0;
  const effectivePassingMarks = exam.totalMarks > 0
    ? (exam.passingMarks > exam.totalMarks
        ? Math.round((exam.totalMarks * Math.min(100, exam.passingMarks)) / 100)
        : exam.passingMarks)
    : 0;
  const derivedSubject = exam.questions?.[0]?.subject || "General";
  const previewHref = isAdminLikePath()
    ? `/admin/exams/${exam.id}/take`
    : `/exams/${exam.id}/take`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessment Details"
        description="Review the assessment configuration, performance metrics, and student submissions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => router.push(getBackHref())}
              variant="outline"
              className="border-border"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={() => router.push(previewHref)}
              variant="outline"
              className="border-border"
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          </div>
        }
      />

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${statusBadge.className}`}>
                {statusBadge.label}
              </span>
              {exam.settings?.proctoring && (
                <span className="px-3 py-1 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold text-[11px] uppercase tracking-wider">
                  Proctored
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">
              {exam.title}
            </h2>
            {exam.description && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">{exam.description}</p>
            )}
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4"
      >
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand" />
          Assessment Metadata
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <MetaTile label="Subject" value={derivedSubject} icon={BookOpen} />
          <MetaTile
            label="Total Questions"
            value={`${totalQuestions}`}
            icon={FileText}
          />
          <MetaTile label="Total Marks" value={`${exam.totalMarks}`} icon={Award} />
          <MetaTile
            label="Passing Marks"
            value={`${effectivePassingMarks} (${passingPercentage}%)`}
            icon={Target}
          />
          <MetaTile label="Duration" value={`${exam.duration || 0} minutes`} icon={Clock} />
          <MetaTile
            label="Created By"
            value={exam.createdBy || "Institution"}
            icon={UserCheck}
          />
          <MetaTile
            label="Created Date"
            value={formatDateOnly(exam.createdAt)}
            icon={Calendar}
          />
          <MetaTile
            label="Scheduled Start"
            value={formatDateTime(exam.startTime ?? exam.scheduledAt)}
            icon={Calendar}
          />
          <MetaTile
            label="Scheduled End"
            value={formatDateTime(exam.endTime)}
            icon={Calendar}
          />
          <MetaTile label="Status" value={statusBadge.label} icon={ShieldCheck} />
        </div>

        {exam.description && (
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Description
            </h4>
            <p className="text-sm text-foreground leading-relaxed">{exam.description}</p>
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4"
      >
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Target className="w-4 h-4 text-brand" />
          Assignment Details
        </h3>

        {groupedTargets.isGlobal ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm font-semibold text-foreground">
            All students (global assignment)
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <AssignmentGroup
              icon={Building2}
              label="Colleges"
              items={groupedTargets.colleges.map((c) => ({
                  id: c.id,
                  label: c.name,
              }))}
              empty="No college filter"
            />
            <AssignmentGroup
              icon={GraduationCap}
              label="Departments"
              items={groupedTargets.departments.map((d) => ({ id: d, label: d }))}
              empty="No department filter"
            />
            <AssignmentGroup
              icon={Calendar}
              label="Academic Years"
              items={groupedTargets.years.map((y) => ({ id: y, label: y }))}
              empty="No year filter"
            />
            <AssignmentGroup
              icon={Users}
              label="Sections"
              items={groupedTargets.sections.map((s) => ({ id: s, label: s }))}
              empty="No section filter"
            />
            <AssignmentGroup
              icon={Users}
              label="Batches"
              items={groupedTargets.batches.map((b) => ({
                id: b.id,
                label: b.name,
              }))}
              empty="No batch filter"
            />
            <AssignmentGroup
              icon={UserCheck}
              label="Selected Students"
              items={groupedTargets.students.map((s) => ({
                  id: s.id,
                  label: s.name,
              }))}
              empty="No direct student selections"
            />
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2 px-1">
          <TrendingUp className="w-4 h-4 text-brand" />
          Performance Overview
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          <StatTile
            icon={Users}
            label="Total Assigned"
            value={stats.totalAssigned}
            tone="brand"
          />
          <StatTile
            icon={CheckCircle2}
            label="Total Attempted"
            value={stats.totalAttempted}
            tone="emerald"
          />
          <StatTile
            icon={Clock}
            label="Total Pending"
            value={stats.totalPending}
            tone="amber"
          />
          <StatTile
            icon={Trophy}
            label="Average Score"
            value={`${stats.averageScore}%`}
            tone="amber"
          />
          <StatTile
            icon={TrendingUp}
            label="Highest Score"
            value={`${stats.highestScore}%`}
            tone="emerald"
          />
          <StatTile
            icon={TrendingDown}
            label="Lowest Score"
            value={`${stats.lowestScore}%`}
            tone="rose"
          />
          <StatTile
            icon={Award}
            label="Pass Percentage"
            value={`${stats.passPercentage}%`}
            tone="purple"
          />
          <StatTile
            icon={ShieldCheck}
            label="Effective Status"
            value={statusBadge.label}
            tone="brand"
          />
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand" />
            Question Bank ({exam.questions?.length ?? 0})
          </h3>

        </div>

        {!exam.questions || exam.questions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground text-center">
            No questions are attached to this assessment.
          </div>
        ) : (
          <div className="space-y-4">
            {exam.questions.map((question, index) => (
              <QuestionReview
                key={question.id}
                question={question}
                index={index}
                showCorrectAnswer={true}
              />
            ))}
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-brand" />
            Student Attempts ({attempts.length})
          </h3>
        </div>

        {attempts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground text-center">
            No students have submitted attempts yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 px-4 border-b border-border">Student</th>
                  <th className="py-3 px-4 border-b border-border">Score</th>
                  <th className="py-3 px-4 border-b border-border">Percentage</th>
                  <th className="py-3 px-4 border-b border-border">Status</th>
                  <th className="py-3 px-4 border-b border-border">Submitted At</th>
                  <th className="py-3 px-4 border-b border-border text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attempts.map((att) => {
                  const studentName = resolveStudent(att.studentId);
                  const isDeletedData = studentName.includes("(Deleted)");
                  const isPassed = att.passed === true;
                  return (
                    <tr key={att.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 font-bold text-foreground">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full ${isDeletedData ? 'bg-destructive/15 text-destructive' : 'bg-brand/15 text-brand'} flex items-center justify-center text-xs font-extrabold shrink-0`}>
                            {studentName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className={`block text-sm leading-tight ${isDeletedData ? 'text-destructive' : ''}`}>{studentName}</span>
                            {isDeletedData && (
                              <span className="block text-[10px] text-destructive font-semibold uppercase tracking-wide mt-0.5">
                                Student Deleted Data
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {att.score} <span className="text-xs text-muted-foreground">/ {att.totalMarks}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        {att.percentage}%
                      </td>
                      <td className="py-3 px-4">
                        {isPassed ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-extrabold uppercase tracking-wider border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Passed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 text-destructive text-[11px] font-extrabold uppercase tracking-wider border border-destructive/30">
                            <XCircle className="w-3.5 h-3.5" />
                            {att.status === "submitted" ? "Review" : (att.status || "Pending")}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground font-medium">
                        {formatDateTime(att.submittedAt || att.createdAt || att.updatedAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          onClick={() => router.push(getAnswerSheetHref(att.id))}
                          variant="outline"
                          size="sm"
                          className="h-8 border-border text-xs font-bold"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View Answer Sheet
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </div>
  );
}

interface StatTileProps {
  icon: typeof Users;
  label: string;
  value: number | string;
  tone: "brand" | "emerald" | "amber" | "rose" | "purple";
}

function StatTile({ icon: Icon, label, value, tone }: StatTileProps) {
  const toneClasses: Record<StatTileProps["tone"], string> = {
    brand: "bg-brand/10 text-brand",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3 shadow-sm">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${toneClasses[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="space-y-0.5 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-extrabold text-foreground leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

interface MetaTileProps {
  icon: typeof Clock;
  label: string;
  value: string;
}

function MetaTile({ icon: Icon, label, value }: MetaTileProps) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3.5 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5 text-brand" />
        <span>{label}</span>
      </div>
      <p className="text-sm font-extrabold text-foreground leading-tight">{value}</p>
    </div>
  );
}

interface AssignmentGroupProps {
  icon: typeof Users;
  label: string;
  items: { id: string; label: string }[];
  empty: string;
}

function AssignmentGroup({ icon: Icon, label, items, empty }: AssignmentGroupProps) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="w-4 h-4 text-brand" />
        <span>{label}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.id}
              className="px-2.5 py-1 rounded-full bg-background border border-border text-xs font-semibold text-foreground"
            >
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
