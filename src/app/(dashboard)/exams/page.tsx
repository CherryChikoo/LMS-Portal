"use client";

import { useEffect, useState, Suspense, useMemo, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { ClipboardList, Plus, FileCode, Play, Eye, Edit3, Trash2, Target, Clock, CheckCircle2, ArrowLeft, ArrowRight, Sparkles, Send, Search, Calendar, Building2, Ban } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllExams, createExam, expireExam, parseMarkdownTest, getEffectiveExamStatus, getStudentAttempts, getStudentAttemptsForCurrentUser, filterExamsForStudent, reviewQuestionsWithAI, findStudentAttemptForExam, type AIReviewResult } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { toDate, toMillis } from "@/lib/utils/date";
import { useLMSData } from "@/lib/data/use-lms-data";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import { formatAuthError } from "@/lib/services/auth-service";
import type { Exam, Question, QuestionType, Student, AssignmentTarget, ExamAttempt } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatSafeDate = (val: any, options?: Intl.DateTimeFormatOptions): string => {
  const d = toDate(val);
  if (!d) return "Live Active";
  return d.toLocaleDateString([], options || { month: "short", day: "numeric", year: "numeric" });
};

function ActionHandler({ onAction }: { onAction: (action: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const action = searchParams.get("action");
    if (action) {
      onAction(action);
    }
  }, [searchParams, onAction]);
  return null;
}

export default function ExamsPage() {
  const router = useRouter();
  const { filteredExams: allExams, filteredAttempts: attempts, loading } = useLMSData();
  const { resolveInstitution, resolveStudent, resolveBatch } = useEntityResolution();
  const exams = useMemo(() => allExams.filter(e => !e.deletedAt), [allExams]);
  
  const [studentUser, setStudentUser] = useState<Student | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);
  const [userRole, setUserRole] = useState<string>("admin");
  const [studentTab, setStudentTab] = useState<"available" | "results">("available");
  const [examSearch, setExamSearch] = useState("");
  const [examSearchRaw, setExamSearchRaw] = useState("");

  // Single centralized hierarchy hook drives both the page filter bar and the
  // test-assignment modal in the create/publish flow. Using a unified hook
  // ensures the institution dropdown lists official colleges, self-registered
  // (external) institutions, and the GLOBAL catch-all.
  const {
    hierarchy,
    filters: examFilters,
    setFilters: setExamFilters,
    institutionOptions: examInstitutionOptions,
    collegeOptions: examCollegeOptions,
    departmentOptions: examDepartmentOptions,
    academicYearOptions: examYearOptions,
    sectionOptions: examSectionOptions,
    batchOptions: examBatchOptions,
    buildAssignmentTarget,
    getInstitutionName,
  } = useAcademicHierarchy({
    levels: ["institution", "department", "academicYear", "section", "batch"],
  });

  // Modal State
  const [creationMode, setCreationMode] = useState<"none" | "manual" | "markdown">("none");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number | "">(30);
  const [passingMarks, setPassingMarks] = useState<number | "">(40);
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");

  // Questions working state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mdText, setMdText] = useState("# Question 1\nWhat is Java?\nA. Language\nB. Database\nC. Browser\nD. Operating System\nAnswer: A\nMarks: 2\n\n# Question 2\nWhat is 2 + 2?\nA. 3\nB. 4\nC. 5\nD. 6\nAnswer: B\nMarks: 2");

  // Preview Mode State
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewQIdx, setPreviewQIdx] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});

  // AI Review State
  const [aiReviewing, setAiReviewing] = useState(false);
  const [aiResults, setAiResults] = useState<AIReviewResult[]>([]);
  const [aiSelections, setAiSelections] = useState<Record<string, "original" | "suggested">>({});
  const [isPublishing, setIsPublishing] = useState(false);



  const getStudentAttemptForExam = (examId: string) =>
    findStudentAttemptForExam(attempts, examId, studentUser);

  useEffect(() => {
    try {
      const storedRole = localStorage.getItem("lms_role");
      if (storedRole) {
        setUserRole(storedRole.toLowerCase());
      }
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        setStudentUser(JSON.parse(uStr) as Student);
      } else {
        setStudentUser({ id: "", name: "", email: "", department: "", collegeId: "", collegeName: "", batchIds: [], semester: 0, section: "", rollNumber: "", createdAt: new Date(), updatedAt: new Date() } as Student);
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
    }
  }, []);

  // Compute the target details route for an exam card. Students always go
  // to the student pre-exam page; trainers/admins respect the /admin prefix
  // when present (otherwise they land on the dashboard route).
  const getExamDetailsPath = (examId: string): string => {
    if (userRole === "student") return `/student/exams/${examId}`;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
      return `/admin/exams/${examId}`;
    }
    return `/exams/${examId}`;
  };

  // Debounce the raw search input into the filter state (300ms) so heavy filter
  // recomputations do not run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setExamSearch(examSearchRaw), 300);
    return () => clearTimeout(t);
  }, [examSearchRaw]);

  const handleParseMarkdown = () => {
    const parsed = parseMarkdownTest(mdText);
    setQuestions(parsed);
  };

  const handleAddManualQuestion = (type: QuestionType = "mcq") => {
    setQuestions([
      ...questions,
      {
        id: `q-man-${Date.now()}`,
        text: type === "fill-blank" ? "The primary programming language used for Android app development is _____" : "New Question Text",
        type,
        options: type === "mcq" ? ["Option A", "Option B", "Option C", "Option D"] : undefined,
        correctAnswer: type === "fill-blank" ? "Java" : "Option A",
        marks: 2,
        subject: "General",
        topic: "Assessment",
        difficulty: "medium",
        tags: ["manual"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  };

  const handleOptimizeWithAI = async () => {
    if (questions.length === 0) return;
    setAiReviewing(true);
    try {
      const results = await reviewQuestionsWithAI(questions);
      setAiResults(results);
      const initialSelections: Record<string, "original" | "suggested"> = {};
      results.forEach(r => { initialSelections[r.id] = "suggested"; });
      setAiSelections(initialSelections);
    } catch (err) {
      console.error(err);
      toast.error(formatAuthError(err, "Failed to review with AI. Please check the logs."));
    } finally {
      setAiReviewing(false);
    }
  };

  const handleApplyAiSelections = () => {
    const updatedQuestions = questions.map(q => {
      const result = aiResults.find(r => r.id === q.id);
      if (result && aiSelections[q.id] === "suggested") {
        return { ...result.suggested, id: q.id };
      }
      return q;
    });
    setQuestions(updatedQuestions);
    setAiResults([]);
    setAiSelections({});
  };

  const handlePublish = async () => {
    if (!title || questions.length === 0) return;

    if (scheduleMode === "scheduled") {
      if (!startTimeStr || !endTimeStr) {
        toast.error("Please select both a start and end date/time for the scheduled exam.");
        return;
      }
      const startDt = new Date(startTimeStr);
      const endDt = new Date(endTimeStr);
      if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime())) {
        toast.error("Invalid date/time selected. Please choose valid values.");
        return;
      }
      if (startDt.getTime() < Date.now() - 5 * 60 * 1000) {
        toast.error("Cannot schedule tests on previous completed days or past times. Please select a future date and time.");
        return;
      }
      if (endDt.getTime() <= startDt.getTime()) {
        const isSameDay =
          startDt.getFullYear() === endDt.getFullYear() &&
          startDt.getMonth() === endDt.getMonth() &&
          startDt.getDate() === endDt.getDate();
        toast.error(
          isSameDay
            ? "End time must be after the start time."
            : "End date must be after the start date."
        );
        return;
      }
    }

    const totalMarks = questions.reduce((acc, q) => acc + (q.marks || 2), 0);
    // Build the assignment target using the centralized helper
    const builtTarget = buildAssignmentTarget();
    
    let targetCollegeId = builtTarget.collegeId;
    let targetCollegeName = builtTarget.collegeName;

    // IMPORTANT: If a college admin creates the exam, force the college assignment
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.role === "college_admin") {
          targetCollegeId = parsed.collegeId;
          targetCollegeName = parsed.collegeName || targetCollegeName;
          
          // Fallback: If localStorage is stale and missing collegeId, fetch it
          if (!targetCollegeId) {
            const { getDocument } = await import("@/lib/firebase/firestore");
            const profile = await getDocument("users", parsed.id);
            if (profile && (profile as any).collegeId) {
              targetCollegeId = (profile as any).collegeId;
              targetCollegeName = (profile as any).collegeName || targetCollegeName;
              
              // Update stale localStorage silently
              parsed.collegeId = targetCollegeId;
              parsed.collegeName = targetCollegeName;
              localStorage.setItem("lms_user", JSON.stringify(parsed));
            }
          }
        }
      }
    } catch(e) {
      console.error("Failed to parse user session for college assignment:", e);
    }

    const compositeTarget: AssignmentTarget = {
      type: "composite",
      ids: ["composite"],
      collegeId: targetCollegeId,
      collegeName: targetCollegeName,
      department: builtTarget.department,
      academicYear: builtTarget.academicYear,
      section: builtTarget.section,
      batchId: builtTarget.batchId,
      batchName: builtTarget.batchName,
    };

    const startDt = scheduleMode === "scheduled" && startTimeStr ? new Date(startTimeStr) : null;
    const endDt = scheduleMode === "scheduled" && endTimeStr ? new Date(endTimeStr) : null;
    const initialStatus = scheduleMode === "scheduled" && startDt && startDt.getTime() > Date.now() ? "scheduled" : "active";

    const examData: Record<string, unknown> = {
      title,
      description: `Contains ${questions.length} questions`,
      duration: Number(duration) || 30,
      totalMarks,
      passingMarks: Number(passingMarks) || 40,
      questionIds: questions.map((q) => q.id),
      questions,
      targets: [compositeTarget],
      status: initialStatus,
      settings: {
        shuffleQuestions: true,
        shuffleOptions: false,
        showResults: true,
        allowReview: true,
        autoSubmit: true,
        proctoring: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Only include time fields when they have actual values (Firestore rejects undefined)
    if (startDt) examData.startTime = startDt;
    if (endDt) examData.endTime = endDt;
    if (startDt) examData.scheduledAt = startDt;

    try {
      setIsPublishing(true);
      const newExamId = await createExam(examData as Omit<Exam, "id">);

      if (questions.length > 0) {
        toast.info("Generating AI Explanations... Please wait.");
        await fetch("/api/ai-explanation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examId: newExamId })
        });
        toast.success("AI Explanations successfully generated!");
      } else {
        toast.success("Assessment created successfully.");
      }

      setCreationMode("none");
      setTitle("");
      setQuestions([]);
      setExamFilters({
        collegeId: "",
        department: "",
        academicYear: "",
        section: "",
        batchId: "",
        studentId: "",
      });
    } catch (err) {
      console.error(err);
      toast.error(formatAuthError(err, "Failed to create assessment."));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleExpire = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Expire Assessment",
      message: "Are you sure you want to expire this assessment early? Students will no longer be able to take it.",
      variant: "warning",
      onConfirm: async () => {
        try {
          await expireExam(id);
          toast.success("Assessment expired successfully");
        } catch (err) {
          console.error("Failed to expire exam:", err);
          toast.error(formatAuthError(err, "Failed to expire assessment."));
        }
      }
    });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <Suspense fallback={null}>
        <ActionHandler onAction={(action) => {
          if (action === "new-markdown" && creationMode === "none") {
            setCreationMode("markdown");
            setQuestions([]);
            // Clear the query parameter so it doesn't re-open on refresh
            window.history.replaceState(null, "", window.location.pathname);
          }
        }} />
      </Suspense>

      <PageHeader
        title="Online Examination Manager"
        description={userRole !== "student" ? "Create dynamic tests manually or via Markdown generator, preview full user experiences, and assign to targeted academic hierarchies." : "Browse assigned evaluation papers and take live proctored examinations."}
        actions={
          <div className="flex items-center gap-3">
            {userRole !== "student" && (
              <>
                <Button
                  onClick={() => {
                    setCreationMode("markdown");
                    setQuestions([]);
                  }}
                  className="bg-brand/10 hover:bg-brand/20 border-0 text-brand flex items-center gap-2 font-bold h-11 px-6 rounded-xl"
                >
                  <FileCode className="w-4 h-4" />
                  <span>Markdown Generator</span>
                </Button>
                <Button
                  onClick={() => {
                    setCreationMode("manual");
                    setQuestions([]);
                  }}
                  className="bg-brand hover:bg-brand/90 text-brand-foreground flex items-center gap-2 font-bold h-11 px-6 rounded-xl"
                >
                  <Plus className="w-4 h-4" />
                  <span>Manual Test Creator</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      {userRole === "student" && (
        <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
          {(["available", "results"] as const).map((tab) => {
            const count = (studentUser ? filterExamsForStudent(exams, studentUser) : []).filter((e) => {
              const eff = getEffectiveExamStatus(e);
              const att = getStudentAttemptForExam(e.id);
              const isSubmitted = att && att.status === "submitted";
              const isExpiredAndNotAttempted = !isSubmitted && (eff === "expired" || eff === "completed" || eff === "cancelled");
              if (tab === "available") return !isSubmitted && !isExpiredAndNotAttempted;
              if (tab === "results") return isSubmitted || isExpiredAndNotAttempted;
              return false;
            }).length;
            return (
              <button
                key={tab}
                onClick={() => setStudentTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  studentTab === tab
                    ? "bg-brand text-white shadow"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground"
                }`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Powerful Hierarchy Filter Bar for Exams */}
      {!loading && exams.length > 0 && (
        <div className="flex flex-col gap-3.5 bg-card/60 backdrop-blur-md p-4 rounded-2xl border border-border/80 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={examSearchRaw}
                onChange={(e) => setExamSearchRaw(e.target.value)}
                placeholder="Search assessments by title or description..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 shadow-sm"
              />
            </div>
            {userRole !== "student" && (
              <div className="text-xs font-semibold text-muted-foreground">
                Showing <span className="text-foreground font-extrabold">
                  {exams.filter(exam => {
                    const t = exam.targets?.[0];
                    if (examFilters.collegeId && t?.collegeId !== examFilters.collegeId) return false;
                    if (examFilters.department && t?.department !== examFilters.department) return false;
                    if (examFilters.academicYear && t?.academicYear !== examFilters.academicYear) return false;
                    if (examFilters.section && t?.section !== examFilters.section) return false;
                    if (examFilters.batchId && t?.batchId !== examFilters.batchId) return false;
                    return true;
                  }).length}
                </span> of {exams.length} Assessments
              </div>
            )}
          </div>

          {userRole !== "student" && (
            <div className="pt-3 border-t border-border/60">
              <AcademicHierarchyFilters
                showInstitution
                levels={["institution", "department", "academicYear", "section", "batch"]}
                filters={examFilters}
                onChange={setExamFilters}
                institutionOptions={examInstitutionOptions}
                collegeOptions={examCollegeOptions}
                departmentOptions={examDepartmentOptions}
                academicYearOptions={examYearOptions}
                sectionOptions={examSectionOptions}
                batchOptions={examBatchOptions}
                studentOptions={[]}
              />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading examinations...</span>
        </div>
      ) : exams.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            userRole !== "student" 
              ? "No online assessments active" 
              : studentTab === "results" 
                ? "You haven't completed any assessments yet." 
                : "No assessments available."
          }
          description={
            userRole !== "student"
              ? "Build structured examinations using our rapid Markdown generator or manual question card editor."
              : studentTab === "results"
                ? "Assessments you complete will appear here along with your AI Learning Review."
                : "Check back when your trainer assigns a new assessment."
          }
          actionLabel={userRole !== "student" ? "Launch Markdown Generator" : undefined}
          onAction={userRole !== "student" ? () => setCreationMode("markdown") : () => {}}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams
            .filter((exam) => {
              const q = examSearch.toLowerCase();
              const matchesSearch = !q || exam.title.toLowerCase().includes(q) || (exam.description || "").toLowerCase().includes(q);
              if (!matchesSearch) return false;

              if (userRole === "student") {
                if (!studentUser || filterExamsForStudent([exam], studentUser).length === 0) return false;
                const eff = getEffectiveExamStatus(exam);
                const att = getStudentAttemptForExam(exam.id);
                const isSubmitted = att && att.status === "submitted";
                const isExpiredAndNotAttempted = !isSubmitted && (eff === "expired" || eff === "completed" || eff === "cancelled");
                if (studentTab === "available") return !isSubmitted && !isExpiredAndNotAttempted;
                if (studentTab === "results") return isSubmitted || isExpiredAndNotAttempted;
              } else {
                const t = exam.targets?.[0];
                if (examFilters.collegeId && t?.collegeId !== examFilters.collegeId) return false;
                if (examFilters.department && t?.department !== examFilters.department) return false;
                if (examFilters.academicYear && t?.academicYear !== examFilters.academicYear) return false;
                if (examFilters.section && t?.section !== examFilters.section) return false;
                if (examFilters.batchId && t?.batchId !== examFilters.batchId) return false;
              }
              return true;
            })
            .sort((a, b) => {
              if (userRole === "student" && studentTab === "results") {
                const attA = getStudentAttemptForExam(a.id);
                const attB = getStudentAttemptForExam(b.id);
                const isSubA = attA && attA.status === "submitted";
                const isSubB = attB && attB.status === "submitted";
                if (isSubA && !isSubB) return -1;
                if (!isSubA && isSubB) return 1;
              }

              const statusA = getEffectiveExamStatus(a);
              const statusB = getEffectiveExamStatus(b);
              
              const weight = (s: string) => {
                if (s === "active") return 1;
                if (s === "scheduled") return 2;
                return 3;
              };
              
              const wA = weight(statusA);
              const wB = weight(statusB);
              
              if (wA !== wB) return wA - wB;
              return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            })
            .map((exam, index, arr) => {
              const effStatus = getEffectiveExamStatus(exam);
              const att = getStudentAttemptForExam(exam.id);

              const getExamTargetDisplay = () => {
                const t = exam.targets?.[0];
                if (!t) return "All Students";
                // New hierarchy shape: targets carry a `level` field (global /
                // institution / department / academicYear / section / batch /
                // student) instead of a `type` discriminator.
                const newShape = t as unknown as { level?: string; studentName?: string; studentId?: string };
                if (newShape.level) {
                  if (newShape.studentId || newShape.studentName) {
                    return `Student: ${resolveStudent(newShape.studentId || "") || newShape.studentName}`;
                  }
                  
                  const institutionLabel = t.collegeId ? resolveInstitution(t.collegeId) : null;
                  const parts = [
                    institutionLabel,
                    t.department ? t.department : null,
                    t.academicYear ? `Year ${t.academicYear}` : null,
                    t.section ? `Sec ${t.section}` : null,
                    t.batchId ? (!t.batchName || t.batchName === t.batchId ? "Unknown Batch" : t.batchName) : null,
                  ].filter(Boolean);
                  return parts.length > 0 ? parts.join(" → ") : "All Students";
                }
                // Legacy composite shape (kept for older records).
                if (t.type === "composite") {
                  const institutionLabel = t.collegeId ? resolveInstitution(t.collegeId) : (t.collegeName || null);
                  const parts = [
                    institutionLabel,
                    t.department && t.department !== "ALL" ? t.department : null,
                    t.academicYear && t.academicYear !== "ALL" ? `Year ${t.academicYear}` : null,
                    t.section && t.section !== "ALL" ? `Sec ${t.section}` : null,
                    t.batchId && t.batchId !== "ALL" ? (!t.batchName || t.batchName === t.batchId ? "Unknown Batch" : t.batchName) : null,
                  ].filter(Boolean);
                  return parts.length > 0 ? parts.join(" → ") : "All Students";
                }
                const isGlobalId = !t.ids || t.ids.length === 0 || t.ids.includes("ALL") || t.ids.includes("composite");
                if (isGlobalId) return "All Students";
                // Resolve raw IDs to institution names via the hierarchy
                const displayNames = (t.ids || []).map((id: string) => resolveInstitution(id));
                const uniqueDisplay = [...new Set(displayNames)].filter(Boolean).join(", ");
                return `${t.type.toUpperCase()}: ${uniqueDisplay}`;
              };

              const isSubmitted = att && att.status === "submitted";
              const isExpiredAndNotAttempted = !isSubmitted && (effStatus === "expired" || effStatus === "completed" || effStatus === "cancelled");

              let sectionHeader = null;
              if (userRole === "student" && studentTab === "results") {
                const prevExam = index > 0 ? arr[index - 1] : null;
                const prevAtt = prevExam ? getStudentAttemptForExam(prevExam.id) : null;
                const prevIsSub = prevAtt && prevAtt.status === "submitted";
                
                if (index === 0 && isSubmitted) {
                  sectionHeader = <div className="col-span-full text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-2">Completed Assessments</div>;
                } else if (isExpiredAndNotAttempted && (!prevExam || prevIsSub)) {
                  sectionHeader = <div className="col-span-full text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 mt-4 pt-4 border-t border-border/40">Not Attempted Assessments</div>;
                }
              }

              if (userRole === "student" && studentTab === "results" && isSubmitted) {
                const submittedDate = att.submittedAt ? formatSafeDate(att.submittedAt) : "N/A";
                const startMs = att.startTime ? toMillis(att.startTime) : 0;
                const endMs = att.submittedAt ? toMillis(att.submittedAt) : 0;
                const timeTaken = startMs && endMs ? Math.max(1, Math.round((endMs - startMs) / 60000)) : 0;

                const card = (
                  <motion.div
                    key={exam.id}
                    whileHover={{ y: -4 }}
                    className="group relative rounded-xl border border-border bg-card p-6 flex flex-col justify-between gap-6 shadow-sm hover:border-brand/40 transition-all duration-300"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase flex items-center gap-1.5 bg-blue-500/15 text-blue-500`}>
                          COMPLETED
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                          <Clock className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>{timeTaken} mins taken</span>
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="text-xl font-extrabold text-foreground tracking-tight line-clamp-1 group-hover:text-brand transition-colors">
                          {exam.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed font-normal">
                          Submitted on {submittedDate}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-3.5 rounded-2xl bg-muted/30 dark:bg-white/[0.03] text-xs">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[11px] font-medium text-muted-foreground">Score</span>
                        <p className={`font-extrabold text-sm mt-0.5 ${att.passed ? "text-emerald-500" : "text-rose-500"}`}>
                          {att.percentage}%
                        </p>
                      </div>
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[11px] font-medium text-muted-foreground">Status</span>
                        <p className={`font-extrabold text-sm mt-0.5 ${att.passed ? "text-emerald-500" : "text-rose-500"}`}>
                          {att.passed ? "PASSED" : "FAILED"}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 pb-1 flex justify-center">
                      <Button
                        onClick={() => {
                          const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
                          router.push(`${prefix}/results/${att.id}`);
                        }}
                        className="w-full max-w-[240px] h-11 rounded-2xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold flex items-center justify-center gap-2 shadow-md shadow-brand/20 scale-[1.01] hover:scale-[1.02] transition-transform"
                      >
                        <Eye className="w-4 h-4 fill-white" />
                        <span>View Result</span>
                      </Button>
                    </div>
                  </motion.div>
                );

                if (sectionHeader) {
                  return <Fragment key={exam.id}>{sectionHeader}{card}</Fragment>;
                }
                return card;
              }

              if (userRole === "student" && studentTab === "results" && isExpiredAndNotAttempted) {
                const card = (
                  <motion.div
                    key={exam.id}
                    whileHover={{ y: -4 }}
                    className="group relative rounded-xl border border-border bg-card p-6 flex flex-col justify-between gap-6 shadow-sm hover:border-brand/40 transition-all duration-300 opacity-80"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase flex items-center gap-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20`}>
                          NOT ATTEMPTED
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{exam.duration} mins</span>
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="text-xl font-extrabold text-foreground tracking-tight line-clamp-1">
                          {exam.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed font-normal">
                          Expired on {exam.endTime ? formatSafeDate(exam.endTime) : "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-3.5 rounded-2xl bg-muted/30 dark:bg-white/[0.03] text-xs">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[11px] font-medium text-muted-foreground">Total Questions</span>
                        <p className="font-extrabold text-foreground text-sm mt-0.5">{exam.questions?.length || exam.questionIds?.length || 0}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-[11px] font-medium text-muted-foreground">Total Marks</span>
                        <p className="font-extrabold text-foreground text-sm mt-0.5">{exam.totalMarks}</p>
                      </div>
                    </div>

                    <div className="pt-1 space-y-3">
                      <Button
                        disabled
                        variant="outline"
                        className="w-full h-11 rounded-2xl border-border text-muted-foreground font-bold flex items-center justify-center gap-2"
                      >
                        <Ban className="w-4 h-4" />
                        <span>Assessment Closed</span>
                      </Button>
                      <Button
                        onClick={() => router.push(getExamDetailsPath(exam.id))}
                        variant="outline"
                        size="sm"
                        className="w-full h-9 rounded-xl border-brand/40 text-brand hover:bg-brand/10 text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </Button>
                    </div>
                  </motion.div>
                );

                if (sectionHeader) {
                  return <Fragment key={exam.id}>{sectionHeader}{card}</Fragment>;
                }
                return card;
              }

              let studentBadgeText = "";
              let studentBadgeColor = "";
              
              if (userRole === "student") {
                if (effStatus === "expired" || effStatus === "completed" || effStatus === "cancelled") {
                  studentBadgeText = "NOT ATTEMPTED";
                  studentBadgeColor = "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50";
                } else if (effStatus === "scheduled") {
                  studentBadgeText = "UPCOMING";
                  studentBadgeColor = "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400";
                } else if (att && att.status !== "submitted") {
                  studentBadgeText = "ACTIVE";
                  studentBadgeColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
                } else {
                  studentBadgeText = "AVAILABLE";
                  studentBadgeColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
                }
              }

              return (
                <motion.div
                  key={exam.id}
                  whileHover={{ y: -4 }}
                  className="group relative rounded-xl border border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-[#0B0F15] dark:hover:border-gray-600 p-6 flex flex-col justify-between gap-5 shadow-sm transition-colors duration-200"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase flex items-center gap-1.5 ${
                        userRole === "student" ? studentBadgeColor :
                        (effStatus === "active" && !att
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : att
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          : effStatus === "expired" || effStatus === "completed" || effStatus === "cancelled"
                          ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50"
                          : effStatus === "scheduled"
                          ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400")
                      }`}>
                        {userRole === "student" ? (
                          <>
                            {(studentBadgeText === "ACTIVE" || studentBadgeText === "AVAILABLE") && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />}
                            {studentBadgeText}
                          </>
                        ) : (
                          <>
                            {effStatus === "active" && !att && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />}
                            {att ? "COMPLETED" : effStatus === "active" ? "ACTIVE (LIVE)" : effStatus === "expired" || effStatus === "completed" || effStatus === "cancelled" ? "EXPIRED" : effStatus}
                          </>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 font-medium">
                        <Clock className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                        <span>{exam.duration} mins</span>
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {exam.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 font-normal">
                        Contains {exam.questions?.length || exam.questionIds?.length || 0} questions
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/30 text-xs mt-1">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500">Questions</span>
                      <p className="font-bold text-gray-900 dark:text-white text-lg mt-1">{exam.questions?.length || exam.questionIds?.length || 0}</p>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500">Total Marks</span>
                      <p className={`font-bold text-lg mt-1 ${effStatus === 'active' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>{exam.totalMarks} marks</p>
                    </div>
                  </div>

                  {userRole !== "student" ? (
                    <div className="space-y-4 pt-1 flex-1 flex flex-col justify-between">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <Calendar className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                            <span>Assigned:</span>
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatSafeDate(exam.createdAt || exam.updatedAt)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <Clock className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                            <span>Window:</span>
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[170px]">
                            {exam.startTime ? formatSafeDate(exam.startTime, { month: "short", day: "numeric" }) : "Always Active"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <Target className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                            <span>Audience:</span>
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[170px]" title={getExamTargetDisplay()}>
                            {getExamTargetDisplay()}
                          </span>
                        </div>

                        {exam.targets?.[0]?.collegeId && exam.targets[0].collegeId !== "GLOBAL" && (
                          <div className="pt-2">
                            {(() => {
                              const instName = resolveInstitution(exam.targets[0].collegeId);
                              const isUnknown = instName.includes("Unknown");
                              return (
                                <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border ${
                                  isUnknown 
                                    ? 'bg-orange-50 border-orange-200 text-orange-700 dark:border-orange-900/50 dark:bg-orange-900/10 dark:text-orange-400' 
                                    : 'bg-gray-100 border-gray-200 text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300'
                                }`}>
                                  <Building2 className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                                  <span className="text-sm font-medium truncate max-w-[200px]" title={instName}>
                                    {instName}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Pass: <strong className="text-gray-900 dark:text-white font-bold">{exam.passingMarks}%</strong>
                          </span>
                          {exam.settings?.proctoring && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 font-bold text-[10px]">
                              Proctored
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => router.push(getExamDetailsPath(exam.id))}
                            variant="outline"
                            size="sm"
                            className="h-9 px-4 text-sm font-medium border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-900/20 flex items-center gap-1.5 rounded-lg"
                            title="View Assessment Details"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Details</span>
                          </Button>
                          <button
                            onClick={() => handleExpire(exam.id)}
                            disabled={effStatus === "expired" || effStatus === "cancelled" || effStatus === "completed"}
                            className={`p-2 rounded-lg transition-all duration-200 border ${
                              effStatus === "expired" || effStatus === "cancelled" || effStatus === "completed"
                                ? "bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800/50 dark:text-gray-500 dark:border-gray-800 cursor-not-allowed"
                                : "bg-transparent text-gray-500 border-gray-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 dark:hover:border-orange-900/50"
                            }`}
                            title={effStatus === "expired" || effStatus === "cancelled" || effStatus === "completed" ? "Assessment already expired" : "Expire Assessment"}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1 space-y-3 flex-1 flex flex-col justify-end">
                      {att && att.status !== "submitted" ? (
                        <Button
                          onClick={() => {
                            const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
                            router.push(`${prefix}/exams/${exam.id}/take`);
                          }}
                          className="w-full h-11 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold flex items-center justify-center gap-2 transition-transform"
                        >
                          <Play className="w-4 h-4 fill-white" />
                          <span>Resume Assessment</span>
                        </Button>
                      ) : effStatus === "active" ? (
                        <Button
                          onClick={() => {
                            const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
                            router.push(`${prefix}/exams/${exam.id}/take`);
                          }}
                          className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 transition-transform"
                        >
                          <Play className="w-4 h-4 fill-white" />
                          <span>Take Assessment Now</span>
                        </Button>
                      ) : effStatus === "scheduled" ? (
                        <Button
                          disabled
                          variant="outline"
                          className="w-full h-11 rounded-lg bg-transparent border-orange-200 text-orange-600 dark:border-orange-900/50 dark:text-orange-400 font-bold flex items-center justify-center gap-2"
                        >
                          <Clock className="w-4 h-4" />
                          <span>Scheduled ({exam.startTime ? (() => { const d = toDate(exam.startTime); return d ? d.toLocaleDateString() : "Later"; })() : "Later"})</span>
                        </Button>
                      ) : (
                        <Button
                          disabled
                          variant="outline"
                          className="w-full h-11 rounded-lg bg-gray-50 border-gray-200 text-gray-500 dark:bg-transparent dark:border-gray-800 dark:text-gray-500 font-bold flex items-center justify-center gap-2"
                        >
                          <Ban className="w-4 h-4" />
                          <span>Assessment Closed</span>
                        </Button>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
            </div>
          )}

      {/* Test Creation Modal (Manual / Markdown) */}
      <AnimatePresence>
        {creationMode !== "none" && !isPreviewing && (
          <div key="test-creation-modal" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
                    {creationMode === "markdown" ? <FileCode className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      {creationMode === "markdown" ? "Markdown Test Generator" : "Manual Examination Builder"}
                    </h3>
                    <p className="text-xs text-muted-foreground">Workflow: Build/Parse → Review/Edit Cards → Live Simulation Preview → Publish</p>
                  </div>
                </div>
                <button onClick={() => setCreationMode("none")} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Examination Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Mid-Term Java Core Assessment"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Passing Percentage (%)</label>
                  <input
                    type="number"
                    value={passingMarks}
                    onChange={(e) => setPassingMarks(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Scheduling Options */}
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand" />
                    <span>Assessment Activation & Timing Window</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("immediate")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        scheduleMode === "immediate" ? "bg-brand text-white shadow" : "bg-card text-muted-foreground border border-border"
                      }`}
                    >
                      Active Immediately
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleMode("scheduled")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        scheduleMode === "scheduled" ? "bg-brand text-white shadow" : "bg-card text-muted-foreground border border-border"
                      }`}
                    >
                      Schedule Window
                    </button>
                  </div>
                </div>

                {scheduleMode === "scheduled" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground">Start Date & Time (Becomes Active)</span>
                      <input
                        type="datetime-local"
                        value={startTimeStr}
                        min={new Date().toISOString().slice(0, 16)}
                        onChange={(e) => setStartTimeStr(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-semibold text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground">End Date & Time (Closes)</span>
                      <input
                        type="datetime-local"
                        value={endTimeStr}
                        min={startTimeStr || new Date().toISOString().slice(0, 16)}
                        onChange={(e) => setEndTimeStr(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-semibold text-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Markdown input box */}
              {creationMode === "markdown" && (
                <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-brand" />
                      <span>Paste Markdown Syntax (# Question X, Options A-D, Answer: X, Marks: X)</span>
                    </span>
                    <Button onClick={handleParseMarkdown} size="sm" className="bg-brand hover:bg-brand/90 text-brand-foreground">
                      Parse & Generate Editable Cards
                    </Button>
                  </div>
                  <textarea
                    value={mdText}
                    onChange={(e) => setMdText(e.target.value)}
                    rows={6}
                    className="w-full p-3 rounded-xl border border-border bg-background font-mono text-xs text-foreground focus:outline-none"
                  />
                </div>
              )}

              {/* Editable Question Cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-foreground">Editable Question Cards ({questions.length})</h4>
                  <div className="flex items-center gap-2">
                    {questions.length > 0 && (
                      <Button
                        onClick={handleOptimizeWithAI}
                        disabled={aiReviewing}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-lg shadow-indigo-500/20"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {aiReviewing ? "Analyzing..." : "Optimize with AI"}
                      </Button>
                    )}
                    {creationMode === "manual" && (
                      <>
                        <Button onClick={() => handleAddManualQuestion("mcq")} size="sm" variant="outline" className="text-brand border-brand font-semibold">
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add MCQ
                        </Button>
                        <Button onClick={() => handleAddManualQuestion("fill-blank")} size="sm" variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500 font-semibold">
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add Blank
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {questions.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                    No questions generated yet. {creationMode === "markdown" ? "Click 'Parse & Generate Editable Cards' above." : "Click 'Add MCQ' or 'Add Blank'."}
                  </div>
                ) : (
                  <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                    {questions.map((q, idx) => (
                      <div key={q.id} className="p-4 rounded-xl border border-border bg-background space-y-3 text-xs">
                        <div className="flex items-center justify-between font-semibold">
                          <div className="flex items-center gap-2">
                            <span>Question #{idx + 1}</span>
                            <select
                              value={q.type || "mcq"}
                              onChange={(e) => {
                                const newType = e.target.value as QuestionType;
                                setQuestions(questions.map((item, i) => (i === idx ? {
                                  ...item,
                                  type: newType,
                                  options: newType === "mcq" ? (item.options?.length ? item.options : ["Option A", "Option B", "Option C", "Option D"]) : undefined,
                                  correctAnswer: newType === "mcq" ? (item.options?.[0] || "Option A") : (typeof item.correctAnswer === "string" ? item.correctAnswer : "")
                                } : item)));
                              }}
                              className="h-7 px-2 rounded border border-border bg-card text-xs font-bold text-brand focus:outline-none"
                            >
                              <option value="mcq">Multiple Choice (MCQ)</option>
                              <option value="fill-blank">Fill in the Blank</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>Marks:</span>
                            <input
                              type="number"
                              value={q.marks}
                              onChange={(e) => {
                                const m = parseInt(e.target.value) || 2;
                                setQuestions(questions.map((item, i) => (i === idx ? { ...item, marks: m } : item)));
                              }}
                              className="w-14 h-7 px-2 rounded border border-border bg-card text-center font-bold"
                            />
                            <button
                              onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                              className="text-destructive hover:underline ml-2"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={q.text}
                          onChange={(e) => setQuestions(questions.map((item, i) => (i === idx ? { ...item, text: e.target.value } : item)))}
                          className="w-full h-9 px-3 rounded-lg border border-border bg-card font-medium text-foreground focus:outline-none"
                        />

                        {q.type === "fill-blank" || q.type === "short-answer" ? (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">Correct Blank Answer:</span>
                            <input
                              type="text"
                              placeholder="Enter exact word or phrase..."
                              value={q.correctAnswer as string}
                              onChange={(e) => setQuestions(questions.map((item, i) => (i === idx ? { ...item, correctAnswer: e.target.value } : item)))}
                              className="flex-1 h-8 px-3 rounded border border-border bg-card font-semibold text-foreground focus:outline-none"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              {q.options?.map((opt, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-2">
                                  <span className="font-bold text-muted-foreground">{String.fromCharCode(65 + oIdx)}.</span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const newOpts = [...(q.options || [])];
                                      newOpts[oIdx] = e.target.value;
                                      setQuestions(questions.map((item, i) => (i === idx ? { ...item, options: newOpts } : item)));
                                    }}
                                    className="w-full h-8 px-2 rounded border border-border bg-card focus:outline-none"
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <span className="font-bold text-emerald-500">Correct Answer:</span>
                              <select
                                value={q.correctAnswer as string}
                                onChange={(e) => setQuestions(questions.map((item, i) => (i === idx ? { ...item, correctAnswer: e.target.value } : item)))}
                                className="h-8 px-2 rounded border border-border bg-card font-semibold text-foreground focus:outline-none"
                              >
                                {q.options?.map((opt, oIdx) => (
                                  <option key={oIdx} value={opt}>
                                    {String.fromCharCode(65 + oIdx)}. {opt}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-Factor Assignment Targeting */}
              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Target className="w-4 h-4 text-brand" />
                  <span>Assignment Target</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Select filters to target specific students. Leave as &ldquo;All&rdquo; to include everyone in that category.</p>

                <AcademicHierarchyFilters
                  layout="grid-2"
                  showInstitution
                  levels={["institution", "department", "academicYear", "section", "batch"]}
                  filters={examFilters}
                  onChange={setExamFilters}
                  institutionOptions={examInstitutionOptions}
                  collegeOptions={examCollegeOptions}
                  departmentOptions={examDepartmentOptions}
                  academicYearOptions={examYearOptions}
                  sectionOptions={examSectionOptions}
                  batchOptions={examBatchOptions}
                  studentOptions={[]}
                />

                {/* Summary Badge */}
                <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                  <span className="text-muted-foreground">Targeting:</span>
                  <span className="font-bold text-foreground">
                    {(() => {
                      const institutionLabel = examFilters.collegeId ? resolveInstitution(examFilters.collegeId) : null;
                      const batchLabel = (examFilters.batchId === "ALL" || !examFilters.batchId) ? null : resolveBatch(examFilters.batchId);
                      return [institutionLabel, examFilters.department || null, examFilters.academicYear || null, examFilters.section ? `Sec ${examFilters.section}` : null, batchLabel].filter(Boolean).join(" → ") || "All Students";
                    })()}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <Button
                  type="button"
                  onClick={() => setIsPreviewing(true)}
                  disabled={questions.length === 0}
                  variant="outline"
                  className="border-brand text-brand flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview Full Student Experience</span>
                </Button>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreationMode("none")}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={!title || questions.length === 0 || isPublishing}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2"
                  >
                    {isPublishing ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>{isPublishing ? "Publishing..." : "Publish & Assign Test"}</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* AI Review Overlay */}
        {aiResults.length > 0 && !isPreviewing && (
          <div key="ai-review-modal" className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-indigo-500/30 bg-card text-foreground shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border p-4 bg-indigo-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">AI Test Optimization</h3>
                    <p className="text-xs text-muted-foreground">Review and accept the AI-suggested improvements for your questions.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      const allSugg: Record<string, "original"|"suggested"> = {};
                      aiResults.forEach(r => allSugg[r.id] = "suggested");
                      setAiSelections(allSugg);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs font-bold border-indigo-500/30 text-indigo-400"
                  >
                    Select All Suggested
                  </Button>
                  <Button
                    onClick={() => {
                      const allOrig: Record<string, "original"|"suggested"> = {};
                      aiResults.forEach(r => allOrig[r.id] = "original");
                      setAiSelections(allOrig);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-xs font-bold border-border"
                  >
                    Select All Original
                  </Button>
                  <Button
                    onClick={() => setAiResults([])}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground ml-2"
                  >
                    Cancel
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 bg-muted/10">
                {questions.map((q, idx) => {
                  const aiRes = aiResults.find(r => r.id === q.id);
                  if (!aiRes) return null;
                  
                  const isSuggested = aiSelections[q.id] === "suggested";
                  const sugg = aiRes.suggested;

                  return (
                    <div key={q.id} className="rounded-xl border border-border bg-background overflow-hidden flex flex-col shadow-sm">
                      <div className="bg-indigo-500/10 p-3 border-b border-border text-xs font-bold text-indigo-400 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">AI Feedback: {aiRes.feedback || "Improved clarity and structure."}</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                        {/* Left: Original */}
                        <div
                          className={`p-4 space-y-3 cursor-pointer transition-colors ${!isSuggested ? "bg-emerald-500/5 ring-2 ring-inset ring-emerald-500/50" : "hover:bg-muted/30"}`}
                          onClick={() => setAiSelections(prev => ({ ...prev, [q.id]: "original" }))}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Original Version</span>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${!isSuggested ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground"}`}>
                              {!isSuggested && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <p className="font-semibold text-sm">{q.text}</p>
                          {q.options && q.options.length > 0 ? (
                            <ul className="space-y-1.5 text-xs">
                              {q.options.map((opt, oIdx) => (
                                <li key={oIdx} className={`px-2 py-1.5 rounded border ${q.correctAnswer === opt ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold" : "border-border text-muted-foreground"}`}>
                                  {String.fromCharCode(65 + oIdx)}. {opt}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1.5 rounded border border-emerald-500/20">
                              Answer: {q.correctAnswer}
                            </div>
                          )}
                        </div>

                        {/* Right: Suggested */}
                        <div
                          className={`p-4 space-y-3 cursor-pointer transition-colors ${isSuggested ? "bg-indigo-500/5 ring-2 ring-inset ring-indigo-500/50" : "hover:bg-muted/30"}`}
                          onClick={() => setAiSelections(prev => ({ ...prev, [q.id]: "suggested" }))}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">AI Suggestion</span>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSuggested ? "border-indigo-500 bg-indigo-500" : "border-muted-foreground"}`}>
                              {isSuggested && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <p className="font-semibold text-sm">{sugg.text}</p>
                          {sugg.options && sugg.options.length > 0 ? (
                            <ul className="space-y-1.5 text-xs">
                              {sugg.options.map((opt, oIdx) => (
                                <li key={oIdx} className={`px-2 py-1.5 rounded border ${sugg.correctAnswer === opt ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-500 font-bold" : "border-border text-muted-foreground"}`}>
                                  {String.fromCharCode(65 + oIdx)}. {opt}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs font-bold text-indigo-500 bg-indigo-500/10 px-2 py-1.5 rounded border border-indigo-500/20">
                              Answer: {sugg.correctAnswer}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-border bg-card flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground">
                  {Object.values(aiSelections).filter(v => v === "suggested").length} of {questions.length} AI suggestions selected.
                </p>
                <Button
                  onClick={handleApplyAiSelections}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Apply Selected Changes
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Trainer Preview Simulation Modal */}
        {isPreviewing && (
          <div key="trainer-preview-modal" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-brand bg-card text-foreground p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-xs font-bold border border-amber-500/30">
                    TRAINER PREVIEW SIMULATION
                  </span>
                  <h3 className="text-lg font-bold text-foreground">{title || "Untitled Assessment"}</h3>
                </div>
                <Button
                  onClick={() => setIsPreviewing(false)}
                  variant="outline"
                  className="border-border text-foreground text-xs font-semibold flex items-center gap-2 hover:bg-accent"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Return to Editing</span>
                </Button>
              </div>

              {/* Simulation Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-muted/40 border border-border text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand" />
                  <span className="text-muted-foreground">Remaining Time: <strong className="font-mono text-sm text-foreground">{duration}:00</strong></span>
                </div>
                <div>
                  <span className="text-muted-foreground">Question: <strong className="text-foreground">{previewQIdx + 1} of {questions.length}</strong></span>
                </div>
                <div className="text-right">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Live Experience Simulation</span>
                </div>
              </div>

              {/* Question card */}
              {questions[previewQIdx] && (
                <div className="p-6 rounded-2xl bg-muted/20 border border-border space-y-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="font-bold text-sm text-foreground">Question #{previewQIdx + 1}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-brand/15 text-brand font-bold text-xs border border-brand/20">
                      {questions[previewQIdx].marks || 2} Marks
                    </span>
                  </div>

                  <p className="text-base font-semibold leading-relaxed text-foreground">{questions[previewQIdx].text}</p>

                  {questions[previewQIdx].type === "fill-blank" || questions[previewQIdx].type === "short-answer" ? (
                    <div className="space-y-2 pt-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Type your answer in the blank below:</label>
                      <input
                        type="text"
                        placeholder="Enter your exact answer here..."
                        value={previewAnswers[questions[previewQIdx].id] || ""}
                        onChange={(e) => setPreviewAnswers({ ...previewAnswers, [questions[previewQIdx].id]: e.target.value })}
                        className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand shadow-sm"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 pt-2">
                      {questions[previewQIdx].options?.map((opt, idx) => {
                        const isSelected = previewAnswers[questions[previewQIdx].id] === opt;
                        return (
                          <button
                            key={idx}
                            onClick={() => setPreviewAnswers({ ...previewAnswers, [questions[previewQIdx].id]: opt })}
                            className={`p-3.5 rounded-xl border text-left text-sm font-medium transition-all flex items-center gap-3 ${
                              isSelected
                                ? "bg-brand/15 border-brand text-foreground font-bold shadow-sm ring-1 ring-brand"
                                : "border-border bg-background hover:bg-accent/40 text-foreground"
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              isSelected ? "bg-brand text-white" : "bg-muted text-muted-foreground border border-border"
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Palette */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  onClick={() => setPreviewQIdx(Math.max(0, previewQIdx - 1))}
                  disabled={previewQIdx === 0}
                  variant="outline"
                  className="border-border text-foreground font-semibold hover:bg-accent"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Previous
                </Button>

                <div className="flex flex-wrap gap-2 p-1.5">
                  {questions.map((_, i) => {
                    const isCurrent = previewQIdx === i;
                    const hasAnswer = previewAnswers[questions[i]?.id];
                    let badgeStyle = "bg-muted text-muted-foreground border border-border hover:bg-accent font-semibold";
                    if (isCurrent) badgeStyle = "bg-brand text-white ring-2 ring-foreground font-extrabold shadow-md scale-110 z-10";
                    else if (hasAnswer) badgeStyle = "bg-emerald-600 text-white font-bold shadow-sm";

                    return (
                      <button
                        key={i}
                        onClick={() => setPreviewQIdx(i)}
                        className={`w-9 h-9 rounded-lg text-xs flex items-center justify-center transition-all ${badgeStyle}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>

                <Button
                  onClick={() => setPreviewQIdx(Math.min(questions.length - 1, previewQIdx + 1))}
                  disabled={previewQIdx === questions.length - 1}
                  className="bg-brand hover:bg-brand/90 text-brand-foreground font-semibold shadow-sm"
                >
                  Next <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        onClose={() => setConfirmConfig(null)}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Confirm"
        variant={confirmConfig?.variant || "destructive"}
        isAlert={confirmConfig?.isAlert}
      />
    </motion.div>
  );
}
