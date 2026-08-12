"use client";

import { useEffect, useState, Suspense, useMemo, Fragment } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useErrorHandler } from "@/providers/error-provider";
import { ClipboardList, Plus, FileCode, Play, Eye, Edit3, Trash2, Target, Clock, CheckCircle2, ArrowLeft, ArrowRight, Sparkles, Send, Search, Calendar, Building2, Ban, Zap, Globe, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllExams, createExam, expireExam, deleteExam, parseMarkdownTest, getEffectiveExamStatus, getStudentAttempts, getStudentAttemptsForCurrentUser, filterExamsForStudent, reviewQuestionsWithAI, findStudentAttemptForExam, type AIReviewResult } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { generateFallbackExplanation } from "@/lib/utils/ai-explanation-fallback";
import { toDate, toMillis } from "@/lib/utils/date";
import { useLMSData } from "@/lib/data/use-lms-data";
import { refreshCache } from "@/lib/data/lms-store";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import { formatAuthError } from "@/lib/services/auth-service";
import { getAuth } from "firebase/auth";
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
  
  const { showError } = useErrorHandler();
  const router = useRouter();

  const { filteredExams: allExams, filteredAttempts: attempts, filteredStudents: students, loading } = useLMSData();
  const { resolveInstitution, resolveStudent, resolveBatch } = useEntityResolution();

  const { userRole: currentRole, userCollegeId } = useMemo(() => {
    if (typeof window === "undefined") return { userRole: "student", userCollegeId: "" };
    try {
      const role = localStorage.getItem("lms_role") || "student";
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const profile = uStr ? JSON.parse(uStr) : {};
      return { userRole: role, userCollegeId: profile.collegeId || "" };
    } catch {
      return { userRole: "student", userCollegeId: "" };
    }
  }, []);

  const exams = useMemo(() => {
    let list = ((allExams || []) as Exam[]).filter((e: Exam) => !e.deletedAt);
    if (currentRole === "college_admin" && userCollegeId) {
      list = list.filter((e: Exam) => {
        const targetColId = (e as any).collegeId || e.targets?.[0]?.collegeId;
        return (
          !targetColId ||
          targetColId === userCollegeId ||
          targetColId === "global" ||
          targetColId === "GLOBAL" ||
          targetColId === "all" ||
          targetColId === "ALL"
        );
      });
    }
    return list;
  }, [allExams, currentRole, userCollegeId]);
  
  const pathname = usePathname();
  const [studentUser, setStudentUser] = useState<Student | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);
  const [userRole, setUserRole] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lms_role")?.toLowerCase() || "student";
    }
    return "student";
  });
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  
  const [studentTab, setStudentTab] = useState<"available" | "results">("available");
  const [adminTab, setAdminTab] = useState<"live" | "expired">("live");
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

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New Creation Flow State
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
        const parsed = JSON.parse(uStr);
        const sId = parsed.id || parsed.uid;
        const sEmail = parsed.email;
        const canonical = students.find((s: Student) => s.id === sId || (sEmail && s.email === sEmail));
        const mergedStudent: Student = {
          ...(parsed || {}),
          ...(canonical || {}),
          collegeId: canonical?.collegeId || parsed?.collegeId || parsed?.college || "",
          collegeName: canonical?.collegeName || parsed?.collegeName || parsed?.college || canonical?.collegeId || parsed?.collegeId || "",
        } as Student;
        setStudentUser(mergedStudent);
      } else {
        setStudentUser({ id: "", name: "", email: "", department: "", collegeId: "", collegeName: "", batchIds: [], semester: 0, section: "", rollNumber: "", status: "active" as const, createdAt: new Date(), updatedAt: new Date() } as unknown as Student);
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
    }
  }, [students]);

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
        options: type === "mcq" ? ["Option A", "Option B", "Option C", "Option D"] : [],
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
      showError(err);
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
        showError({ message: "Please select both a start and end date/time for the scheduled exam." });
        return;
      }
      const startDt = new Date(startTimeStr);
      const endDt = new Date(endTimeStr);
      if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime())) {
        showError({ message: "Invalid date/time selected. Please choose valid values." });
        return;
      }
      if (startDt.getTime() < Date.now() - 5 * 60 * 1000) {
        showError({ message: "Cannot schedule tests on previous completed days or past times. Please select a future date and time." });
        return;
      }
      if (endDt.getTime() <= startDt.getTime()) {
        const isSameDay =
          startDt.getFullYear() === endDt.getFullYear() &&
          startDt.getMonth() === endDt.getMonth() &&
          startDt.getDate() === endDt.getDate();
        showError({
          message: isSameDay
            ? "End time must be after the start time."
            : "End date must be after the start date."
        });
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

    const isCleanVal = (v?: string) => {
      if (!v) return undefined;
      const lower = v.toLowerCase().trim();
      if (lower === "" || lower === "all" || lower === "all_departments" || lower === "global") return undefined;
      return v;
    };

    const compositeTarget: AssignmentTarget = {
      level: builtTarget.level || "institution",
      type: "composite",
      ids: ["composite"],
      collegeId: isCleanVal(targetCollegeId),
      collegeName: isCleanVal(targetCollegeName),
      department: isCleanVal(builtTarget.department),
      academicYear: isCleanVal(builtTarget.academicYear),
      section: isCleanVal(builtTarget.section),
      batchId: isCleanVal(builtTarget.batchId),
      batchName: isCleanVal(builtTarget.batchName),
    };

    const startDt = scheduleMode === "scheduled" && startTimeStr ? new Date(startTimeStr) : null;
    const endDt = scheduleMode === "scheduled" && endTimeStr ? new Date(endTimeStr) : null;
    const initialStatus = scheduleMode === "scheduled" && startDt && startDt.getTime() > Date.now() ? "scheduled" : "active";

    try {
      setIsPublishing(true);

      // Pre-populate all questions with valid AI explanations in memory before saving to Firestore
      const finalQuestions = questions.map((q) => {
        if (!q.aiExplanation) {
          return {
            ...q,
            aiExplanation: generateFallbackExplanation(q),
            aiExplanationStatus: "pending" as const,
          };
        }
        return q;
      });

      const examData: Record<string, unknown> = {
        title,
        description: `Contains ${finalQuestions.length} questions`,
        duration: Number(duration) || 30,
        totalMarks,
        passingMarks: Number(passingMarks) || 40,
        questionIds: finalQuestions.map((q) => q.id),
        questions: finalQuestions,
        targets: [compositeTarget],
        collegeId: compositeTarget.collegeId,
        collegeName: compositeTarget.collegeName,
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

      if (startDt) examData.startTime = startDt;
      if (endDt) examData.endTime = endDt;
      if (startDt) examData.scheduledAt = startDt;

      const newExamId = await createExam(examData as Omit<Exam, "id">);
      await refreshCache();

      toast.success("Assessment & AI Explanations created successfully!");

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

      // Background Gemini upgrade (non-blocking)
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      fetch("/api/ai-explanation", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ examId: newExamId }),
      }).then(async res => {
          if (!res.ok) {
              const text = await res.text();
              console.error("[BACKGROUND AI PIPELINE] Server Error:", res.status, text);
              toast.error("AI Generation failed: " + text);
          } else {
              const data = await res.json();
              if (data.failedCount > 0) {
                  toast.warning(`AI generated ${data.generatedCount} explanations, but fell back to basic templates for ${data.failedCount} due to Gemini API limits.`);
              } else {
                  console.log("[BACKGROUND AI PIPELINE] Success:", data);
              }
          }
      }).catch((err) => {
          console.error("[BACKGROUND AI PIPELINE] Fetch error:", err);
          toast.error("AI Generation failed: " + err.message);
      });

      if (userRole !== "student") {
        router.push("/admin/exams");
      }
    } catch (err) {
      console.error("[CREATE EXAM ERROR]", err);
      showError(err);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleExpire = (exam: Exam) => {
    const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
    const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
    if (userRole === "college_admin" && isGlobal) {
      toast.error("Global assignments are managed system-wide and cannot be expired by College Admins.");
      return;
    }
    setConfirmConfig({
      isOpen: true,
      title: "Expire Assessment",
      message: "Are you sure you want to expire this assessment early? Students will no longer be able to take it.",
      variant: "warning",
      onConfirm: async () => {
        try {
          await expireExam(exam.id);
          toast.success("Assessment expired successfully");
        } catch (err) {
          console.error("Failed to expire exam:", err);
          showError(err);
        }
      }
    });
  };

  const handleDeleteExam = (exam: Exam) => {
    const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
    const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
    if (userRole === "college_admin" && isGlobal) {
      toast.error("Global assignments are managed system-wide and cannot be deleted by College Admins.");
      return;
    }
    setConfirmConfig({
      isOpen: true,
      title: "Delete Assessment",
      message: "Are you sure you want to permanently delete this assessment? ALL associated student results will also be deleted completely. This action cannot be undone.",
      variant: "destructive",
      onConfirm: async () => {
        try {
          setDeletingId(exam.id);
          await deleteExam(exam.id);
          await refreshCache();
          toast.success("Assessment deleted successfully");
        } catch (err) {
          console.error("Failed to delete exam:", err);
          showError(err);
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  return (
    <>
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            {userRole !== "student" && (
              <>
                <Button
                  onClick={() => {
                    setCreationMode("markdown");
                    setQuestions([]);
                  }}
                  className="bg-brand/10 hover:bg-brand/20 border-0 text-brand flex items-center justify-center gap-2 font-bold h-11 px-4 sm:px-6 rounded-xl w-full sm:w-auto"
                >
                  <FileCode className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">Markdown Generator</span>
                </Button>
                <Button
                  onClick={() => {
                    setCreationMode("manual");
                    setQuestions([]);
                  }}
                  className="bg-brand hover:bg-brand/90 text-brand-foreground flex items-center justify-center gap-2 font-bold h-11 px-4 sm:px-6 rounded-xl w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">Manual Test Creator</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      {userRole === "student" && (
        <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
          {(["available", "results"] as const).map((tab) => {
            const count = exams.filter((e) => {
              if (!studentUser) return false;
              
              const att = getStudentAttemptForExam(e.id);
              const isAssigned = filterExamsForStudent([e], studentUser).length > 0;
              
              if (!isAssigned && !att) return false;

              const eff = getEffectiveExamStatus(e);
              const isSubmitted = att && att.status === "submitted";
              const isExpiredAndNotAttempted = !isSubmitted && (eff === "expired" || eff === "completed" || eff === "cancelled");
              
              const effectivelyExpired = isExpiredAndNotAttempted || (!isAssigned && !!att && !isSubmitted);
              const effectivelySubmitted = isSubmitted || (!isAssigned && !!att);
              
              if (tab === "available") return !effectivelySubmitted && !effectivelyExpired;
              if (tab === "results") return effectivelySubmitted || effectivelyExpired;
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
                {tab} <span suppressHydrationWarning>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {userRole !== "student" && (
        <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto mt-6">
          {(["live", "expired"] as const).map((tab) => {
            const count = exams.filter((e) => {
              const eff = getEffectiveExamStatus(e);
              if (tab === "live") return eff === "active" || eff === "scheduled" || eff === "draft";
              if (tab === "expired") return eff === "expired" || eff === "completed" || eff === "cancelled";
              return false;
            }).length;
            return (
              <button
                key={tab}
                onClick={() => setAdminTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  adminTab === tab
                    ? "bg-brand text-white shadow"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground"
                }`}
              >
                {tab === "live" ? "Live & Upcoming" : "Past & Expired"} <span suppressHydrationWarning>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Powerful Hierarchy Filter Bar for Exams */}
      {(!mounted || loading) ? (
        <div className="flex flex-col gap-3.5 bg-card/95 p-4 rounded-2xl border border-border/80 shadow-sm animate-pulse h-20" />
      ) : exams.length > 0 && (
        <div className="flex flex-col gap-3.5 bg-card/95 p-4 rounded-2xl border border-border/80 shadow-sm" suppressHydrationWarning>
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between" suppressHydrationWarning>
            <div className="relative w-full sm:w-80" suppressHydrationWarning>
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
                    const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
                    const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
                    
                    const hasSubCollegeFilter = !!(examFilters.department || examFilters.academicYear || examFilters.section || examFilters.batchId);

                    if (isGlobal) {
                      if (hasSubCollegeFilter) return false;
                      if (userRole === "admin" && examFilters.collegeId && examFilters.collegeId !== "GLOBAL") return false;
                      return true;
                    }

                    if (examFilters.collegeId) {
                      const matchesRoot = (exam as any).collegeId === examFilters.collegeId;
                      const matchesCollege = matchesRoot || exam.targets?.some(target => 
                        target.collegeId === examFilters.collegeId || 
                        target.ids?.includes(examFilters.collegeId)
                      );
                      if (!matchesCollege) return false;
                    }
                    const t = exam.targets?.[0];
                    if (examFilters.department && (t?.department || "").trim().toLowerCase() !== (examFilters.department || "").trim().toLowerCase()) return false;
                    if (examFilters.academicYear && t?.academicYear && t.academicYear !== examFilters.academicYear) return false;
                    if (examFilters.section && (t?.section || "").trim().toLowerCase() !== (examFilters.section || "").trim().toLowerCase()) return false;
                    if (examFilters.batchId && t?.batchId && t.batchId !== examFilters.batchId) return false;
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

      {(!mounted || loading) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-64 rounded-2xl bg-card/60 animate-pulse border border-border/60" />)}
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
                if (!studentUser) return false;
                
                const att = getStudentAttemptForExam(exam.id);
                const isAssigned = filterExamsForStudent([exam], studentUser).length > 0;
                
                // If they are not assigned and have no attempt, completely hide it
                if (!isAssigned && !att) return false;

                const eff = getEffectiveExamStatus(exam);
                const isSubmitted = att && att.status === "submitted";
                const isExpiredAndNotAttempted = !isSubmitted && (eff === "expired" || eff === "completed" || eff === "cancelled");
                
                // If they are no longer assigned but have an attempt, force it to act like a completed/expired exam
                // so it moves to the Results tab.
                const effectivelyExpired = isExpiredAndNotAttempted || (!isAssigned && !!att && !isSubmitted);
                const effectivelySubmitted = isSubmitted || (!isAssigned && !!att);
                
                if (studentTab === "available" && (effectivelySubmitted || effectivelyExpired)) return false;
                if (studentTab === "results" && !effectivelySubmitted && !effectivelyExpired) return false;
                return true;
              } else {
                const eff = getEffectiveExamStatus(exam);
                if (adminTab === "live" && !(eff === "active" || eff === "scheduled" || eff === "draft")) return false;
                if (adminTab === "expired" && !(eff === "expired" || eff === "completed" || eff === "cancelled")) return false;

                const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
                const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
                
                const hasSubCollegeFilter = !!(examFilters.department || examFilters.academicYear || examFilters.section || examFilters.batchId);

                if (isGlobal) {
                  if (hasSubCollegeFilter) return false;
                  if (userRole === "admin" && examFilters.collegeId && examFilters.collegeId !== "GLOBAL") return false;
                  return true;
                }

                if (examFilters.collegeId) {
                  const matchesRoot = (exam as any).collegeId === examFilters.collegeId;
                  const matchesCollege = matchesRoot || exam.targets?.some(target => 
                    target.collegeId === examFilters.collegeId || 
                    target.ids?.includes(examFilters.collegeId)
                  );
                  if (!matchesCollege) return false;
                }
                const t = exam.targets?.[0];
                if (examFilters.department && (t?.department || "").trim().toLowerCase() !== (examFilters.department || "").trim().toLowerCase()) return false;
                if (examFilters.academicYear && t?.academicYear && t.academicYear !== examFilters.academicYear) return false;
                if (examFilters.section && (t?.section || "").trim().toLowerCase() !== (examFilters.section || "").trim().toLowerCase()) return false;
                if (examFilters.batchId && t?.batchId && t.batchId !== examFilters.batchId) return false;
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

              if (userRole !== "student") {
                return (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0);
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
              return (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0);
            })
            .map((exam, index, arr) => {
              const effStatus = getEffectiveExamStatus(exam);
              const att = getStudentAttemptForExam(exam.id);

              const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
              const isGlobalAssignment = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";

              const getExamTargetDisplay = () => {
                if (isGlobalAssignment) return "Global Assignment (All Colleges)";
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
                  
                  const rawInst = t.collegeName || (t.collegeId ? resolveInstitution(t.collegeId) : null);
                  const institutionLabel = (!rawInst || rawInst.includes("Unknown")) && t.collegeId ? t.collegeId : rawInst;
                  const parts = [
                    institutionLabel,
                    t.department ? t.department : null,
                    t.academicYear ? `Year ${t.academicYear}` : null,
                    t.section ? `Sec ${t.section}` : null,
                    t.batchId ? (!t.batchName || t.batchName === t.batchId ? "Custom Cohort" : t.batchName) : null,
                  ].filter(Boolean);
                  return parts.length > 0 ? parts.join(" → ") : "All Students";
                }
                // Legacy composite shape (kept for older records).
                if (t.type === "composite") {
                  const rawInst = t.collegeName || (t.collegeId ? resolveInstitution(t.collegeId) : null);
                  const institutionLabel = (!rawInst || rawInst.includes("Unknown")) && t.collegeId ? t.collegeId : rawInst;
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
                          Expired on {exam.endTime ? formatSafeDate(exam.endTime) : (exam.updatedAt ? formatSafeDate(exam.updatedAt) : "N/A")}
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
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
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

                        {isGlobalAssignment && userRole !== "student" && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-sm">
                            <Globe className="w-3.5 h-3.5 shrink-0" />
                            Global Assignment
                          </span>
                        )}
                      </div>
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

                        {isGlobalAssignment && userRole !== "student" ? (
                          <div className="pt-2">
                            <div className="inline-flex flex-col gap-0.5 px-3 py-2 rounded-lg border bg-blue-50/50 border-blue-200/60 dark:border-blue-900/40 dark:bg-blue-900/10">
                              <span className="text-[10px] font-bold text-blue-500/80 uppercase tracking-wider">Test Provider</span>
                              <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                                <Globe className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                                <span className="text-sm font-bold truncate max-w-[200px]" title="Global LMS Platform">
                                  Global System Assignment
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (exam.targets?.[0]?.collegeId || (exam as any).collegeId) && (
                          <div className="pt-2">
                            {(() => {
                              const targetCol = exam.targets?.[0];
                              const targetId = targetCol?.collegeId || (exam as any).collegeId || "";
                              const targetName = targetCol?.collegeName || (exam as any).collegeName || "";
                              const resolvedInstName = resolveInstitution(targetId || targetName || "").toLowerCase();
                              const instName = resolvedInstName !== "unassigned" && !resolvedInstName.includes("unknown") ? resolvedInstName : (targetName.toLowerCase() || targetId.toLowerCase() || "institution");
                              const isUnknown = instName.includes("unknown");
                              const isAdminCreated = 
                                (exam as any).createdByRole === "admin" || 
                                (exam as any).createdByRole === "trainer" || 
                                (exam as any).createdByRole === "super_admin" || 
                                (exam as any).isMainAdminCreated ||
                                ((exam as any).createdByName || "").toLowerCase().includes("admin") ||
                                ((exam as any).author || "").toLowerCase().includes("admin");

                              return (
                                <div className={`inline-flex flex-col gap-0.5 px-3 py-2 rounded-lg border ${
                                  isUnknown 
                                    ? 'bg-orange-50 border-orange-200 dark:border-orange-900/50 dark:bg-orange-900/10' 
                                    : 'bg-gray-50 border-gray-200 dark:border-gray-700 dark:bg-gray-800/50'
                                }`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Test Provider</span>
                                    {isAdminCreated && (
                                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                        Admin Created
                                      </span>
                                    )}
                                  </div>
                                  <div className={`flex items-center gap-1.5 ${isUnknown ? 'text-orange-700 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    <Building2 className={`w-3.5 h-3.5 shrink-0 ${isUnknown ? 'text-orange-500' : 'text-emerald-500'}`} />
                                    <span className="text-sm font-bold truncate max-w-[200px]" title={isAdminCreated ? `Main Admin (Assigned to ${instName})` : instName}>
                                      {isAdminCreated ? "Main Admin" : instName}
                                    </span>
                                  </div>
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
                            onClick={() => handleExpire(exam)}
                            disabled={effStatus === "expired" || effStatus === "cancelled" || effStatus === "completed" || (userRole === "college_admin" && isGlobalAssignment)}
                            className={`p-2 rounded-lg transition-all duration-200 border ${
                              effStatus === "expired" || effStatus === "cancelled" || effStatus === "completed" || (userRole === "college_admin" && isGlobalAssignment)
                                ? "opacity-40 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-600 dark:border-gray-700"
                                : "bg-transparent text-gray-500 border-gray-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 dark:text-gray-400 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 dark:hover:border-orange-900/50"
                            }`}
                            title={
                              userRole === "college_admin" && isGlobalAssignment
                                ? "Global assignments cannot be expired by College Admins"
                                : effStatus === "expired" || effStatus === "cancelled" || effStatus === "completed"
                                ? "Assessment already expired"
                                : "Expire Assessment"
                            }
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteExam(exam)}
                            disabled={deletingId === exam.id || (userRole === "college_admin" && isGlobalAssignment)}
                            className={`p-2 rounded-lg transition-all duration-200 border ${
                              deletingId === exam.id || (userRole === "college_admin" && isGlobalAssignment)
                                ? "opacity-40 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-600 dark:border-gray-700"
                                : "bg-transparent text-gray-500 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-900/50"
                            }`}
                            title={
                              deletingId === exam.id 
                                ? "Deleting..." 
                                : userRole === "college_admin" && isGlobalAssignment
                                ? "Global assignments cannot be deleted by College Admins"
                                : "Delete Assessment"
                            }
                          >
                            {deletingId === exam.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
      </motion.div>

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

              {/* Premium Scheduling UI */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/60 shadow-sm relative overflow-hidden group/schedule transition-all duration-300 hover:border-brand/30">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <div>
                    <label className="text-sm font-bold text-foreground flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-brand/10 text-brand">
                        <Clock className="w-4 h-4" />
                      </div>
                      Assessment Timing Window
                    </label>
                    <p className="text-xs text-muted-foreground mt-1 ml-9">Choose when students can access and take this test.</p>
                  </div>

                  <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl border border-border/50 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("immediate")}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                        scheduleMode === "immediate" 
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      }`}
                    >
                      <Zap className={`w-3.5 h-3.5 ${scheduleMode === "immediate" ? "text-amber-500 fill-amber-500" : ""}`} />
                      Active Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleMode("scheduled")}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                        scheduleMode === "scheduled" 
                          ? "bg-brand text-white shadow-sm shadow-brand/20 ring-1 ring-brand" 
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      Schedule Date
                    </button>
                  </div>
                </div>

                {scheduleMode === "scheduled" && (
                  <div className="mt-4 p-4 rounded-xl bg-background border border-border/50 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-3 group">
                      <label className="text-[12px] font-bold text-foreground flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand"></div>
                        Start Time (Opens)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            type="date"
                            value={startTimeStr ? startTimeStr.split('T')[0] : ''}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => {
                              const dateVal = e.target.value;
                              if (!dateVal) return;
                              // If no time is set yet, default to current time instead of midnight to avoid instant validation failures for "today"
                              let timeVal = startTimeStr ? (startTimeStr.split('T')[1] || '') : '';
                              if (!timeVal) {
                                const now = new Date();
                                timeVal = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                              }
                              const newVal = `${dateVal}T${timeVal}`;
                              setStartTimeStr(newVal);
                            }}
                            className="w-full h-11 px-3.5 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 focus:bg-background transition-all cursor-pointer"
                            style={{ colorScheme: "dark" }}
                          />
                        </div>
                        <div className="relative w-full sm:w-[140px]">
                          <input
                            type="time"
                            value={startTimeStr ? startTimeStr.split('T')[1] : ''}
                            onChange={(e) => {
                              const timeVal = e.target.value;
                              if (!timeVal) return;
                              const dateVal = startTimeStr ? startTimeStr.split('T')[0] : new Date().toISOString().split('T')[0];
                              const newVal = `${dateVal}T${timeVal}`;
                              setStartTimeStr(newVal);
                            }}
                            className="w-full h-11 px-3.5 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 focus:bg-background transition-all cursor-pointer"
                            style={{ colorScheme: "dark" }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 group">
                      <label className="text-[12px] font-bold text-foreground flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive"></div>
                        End Time (Closes)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            type="date"
                            value={endTimeStr ? endTimeStr.split('T')[0] : ''}
                            min={startTimeStr ? startTimeStr.split('T')[0] : new Date().toISOString().split('T')[0]}
                            onChange={(e) => {
                              const dateVal = e.target.value;
                              if (!dateVal) return;
                              // If no time is set, default to 1 hour after start time if available
                              let timeVal = endTimeStr ? (endTimeStr.split('T')[1] || '') : '';
                              if (!timeVal) {
                                if (startTimeStr) {
                                  const startD = new Date(startTimeStr);
                                  startD.setHours(startD.getHours() + 1);
                                  timeVal = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')}`;
                                } else {
                                  const now = new Date();
                                  now.setHours(now.getHours() + 1);
                                  timeVal = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                                }
                              }
                              const newVal = `${dateVal}T${timeVal}`;
                              setEndTimeStr(newVal);
                            }}
                            disabled={!startTimeStr}
                            className="w-full h-11 px-3.5 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 focus:bg-background transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ colorScheme: "dark" }}
                          />
                        </div>
                        <div className="relative w-full sm:w-[140px]">
                          <input
                            type="time"
                            value={endTimeStr ? endTimeStr.split('T')[1] : ''}
                            onChange={(e) => {
                              const timeVal = e.target.value;
                              if (!timeVal) return;
                              const dateVal = endTimeStr ? endTimeStr.split('T')[0] : (startTimeStr ? startTimeStr.split('T')[0] : new Date().toISOString().split('T')[0]);
                              const newVal = `${dateVal}T${timeVal}`;
                              setEndTimeStr(newVal);
                            }}
                            disabled={!startTimeStr}
                            className="w-full h-11 px-3.5 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 focus:bg-background transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ colorScheme: "dark" }}
                          />
                        </div>
                      </div>
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
                    rows={10}
                    placeholder={`# Question 1
What is the capital of France?
A. Paris
B. London
C. Berlin
D. Madrid
Answer: A
Marks: 2

# Question 2
React is a framework for backend development.
A. True
B. False
Answer: B
Marks: 1`}
                    className="w-full p-3 rounded-xl border border-border bg-background font-mono text-xs text-foreground focus:outline-none placeholder:text-muted-foreground/50"
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
                                  options: newType === "mcq" ? (item.options?.length ? item.options : ["Option A", "Option B", "Option C", "Option D"]) : [],
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
                  showBatchToggle={true}
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
                    <span>{isPublishing ? "Generating AI & Publishing Exam..." : "Publish & Assign Test"}</span>
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

                <div className="flex flex-wrap gap-4 p-4">
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
    </>
  );
}
