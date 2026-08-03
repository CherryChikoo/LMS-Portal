"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Clock, AlertTriangle, CheckCircle2, Bookmark, ArrowLeft, ArrowRight, Send, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getExamById, submitExamAttempt, getStudentAttemptsForCurrentUser, getEffectiveExamStatus, filterExamsForStudent, getStudentById, getStudentByEmail } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import type { Exam, QuestionPaletteState, Student, ExamAttempt } from "@/types";

export default function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);
  const [existingAttempt, setExistingAttempt] = useState<ExamAttempt | null>(null);

  // Exam Progress State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [paletteStates, setPaletteStates] = useState<Record<string, QuestionPaletteState>>({});
  const [timeLeft, setTimeLeft] = useState<number>(1800); // in seconds
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [fullScreenViolations, setFullScreenViolations] = useState(0);
  const [showStrikeOneModal, setShowStrikeOneModal] = useState(false);
  const [showStartOverlay, setShowStartOverlay] = useState(true);
  const [candidateName, setCandidateName] = useState("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlinePending, setOfflinePending] = useState(false);
  const submitLockRef = useRef(false);
  const lastViolationTimeRef = useRef(0);

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem("lms_role");
      const savedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
      let name = "";
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u.name) name = u.name;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading saved candidate name from localStorage on mount
      setCandidateName(
        savedRole === "admin" || savedRole === "trainer"
          ? name
            ? `${name} (Preview Mode)`
            : "Trainer Preview Mode"
          : name
      );
    } catch {
      setCandidateName("");
    }

    async function load() {
      setLoading(true);
      try {
        const data = await getExamById(resolvedParams.id);
        if (data) {
          if (data?.deletedAt) {
            setAccessDeniedReason("Assessment Unavailable. This assessment has been removed.");
            setLoading(false);
            return;
          }
          let role = "";
          try {
            role = localStorage.getItem("lms_role") || "";
          } catch {}

          if (role !== "admin" && role !== "trainer") {
            // Resolve the current Firebase user instead of relying only on localStorage.
            const me = await getCurrentUser();
            const sId = me?.uid || "";
            const sEmail = me?.email || "";

            // Non-admin/trainer users must be authenticated students
            if (role !== "student" || !sId || !sEmail) {
              setAccessDeniedReason("Authentication Required. Please sign in as a registered student to take this assessment.");
              setLoading(false);
              return;
            }

            // Verify this exam is actually assigned to the current student.
            let studentProfile = sId ? await getStudentById(sId) : null;
            if (!studentProfile && sEmail) {
              studentProfile = await getStudentByEmail(sEmail);
            }
            if (!studentProfile && me?.profile) {
              studentProfile = me.profile as unknown as Student;
            }
            if (studentProfile) {
              studentProfile = {
                ...(me?.profile || {}),
                ...studentProfile,
                collegeId: studentProfile.collegeId || (me?.profile as any)?.collegeId || (me?.profile as any)?.college || "",
                collegeName: studentProfile.collegeName || (me?.profile as any)?.collegeName || (me?.profile as any)?.college || studentProfile.collegeId || "",
              } as Student;
            } else {
              setAccessDeniedReason("Student Account Not Found. Please contact your administrator.");
              setLoading(false);
              return;
            }

            // Sync latest candidate name if the Firestore profile differs
            if (studentProfile.name && studentProfile.name !== candidateName) {
              setCandidateName(studentProfile.name);
            }

            const isEligible = filterExamsForStudent([data], studentProfile).length > 0;

            if (!isEligible) {
              setAccessDeniedReason("Assessment Not Assigned. This evaluation is not assigned to your batch or academic hierarchy.");
              setLoading(false);
              return;
            }

            const effStatus = getEffectiveExamStatus(data);
            if (effStatus === "expired" || effStatus === "completed" || effStatus === "cancelled" || (data.status as string) === "closed") {
              setAccessDeniedReason("Assessment Closed. The scheduled timeline for this evaluation has expired.");
              setLoading(false);
              return;
            }

            try {
              const attempts = await getStudentAttemptsForCurrentUser(sId, sEmail);
              const found = attempts.find((a) => a.examId === resolvedParams.id);
              if (found) {
                setExistingAttempt(found);
                setAccessDeniedReason(`You have already completed this evaluation. Earned Score: ${found.percentage}% (${found.passed ? "PASSED" : "REVIEW"}).`);
                setLoading(false);
                return;
              }
            } catch {}
          }

          setExam(data);
          setTimeLeft((data.duration || 30) * 60);

          // Attempt to restore persisted progress from sessionStorage (active exam only)
          let restoredAnswers: Record<string, string> = {};
          let restoredPalette: Record<string, QuestionPaletteState> = {};
          try {
            const raw = typeof window !== "undefined" ? sessionStorage.getItem("lms_exam_" + data.id) : null;
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === "object") {
                if (parsed.answers && typeof parsed.answers === "object") {
                  restoredAnswers = parsed.answers as Record<string, string>;
                }
                if (parsed.paletteStates && typeof parsed.paletteStates === "object") {
                  restoredPalette = parsed.paletteStates as Record<string, QuestionPaletteState>;
                }
              }
            }
          } catch {
            // Ignore corrupt session storage payload; fall back to fresh state
          }

          // Initialize palette states as 'not_visited' except index 0 as 'not_answered'
          // Merge with any restored palette so the user resumes where they left off
          const initPalette: Record<string, QuestionPaletteState> = {};
          data.questions?.forEach((q, idx) => {
            initPalette[q.id] = restoredPalette[q.id] ?? (idx === 0 ? "not_answered" : "not_visited");
          });
          setPaletteStates(initPalette);

          // Restore answers, keeping only entries that still correspond to a known question
          const restoredAnswerMap: Record<string, string> = {};
          data.questions?.forEach((q) => {
            if (restoredAnswers[q.id] !== undefined) {
              restoredAnswerMap[q.id] = restoredAnswers[q.id];
            }
          });
          setAnswers(restoredAnswerMap);
        }
      } catch (err) {
        console.error("Failed to load exam", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [resolvedParams.id]);

  // Request fullscreen once the student starts the exam
  const enterFullscreen = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docEl = document.documentElement as any;
    if (docEl.requestFullscreen) {
      try {
        await docEl.requestFullscreen();
      } catch {
        // Fullscreen may be blocked by browser policy; ignore silently
      }
    } else if (docEl.webkitRequestFullscreen) {
      try {
        await docEl.webkitRequestFullscreen();
      } catch {}
    } else if (docEl.msRequestFullscreen) {
      try {
        await docEl.msRequestFullscreen();
      } catch {}
    }
  }, []);

  const handleStartExam = useCallback(async () => {
    setShowStartOverlay(false);
    setStartTime(new Date());
    await enterFullscreen();
  }, [enterFullscreen]);

  // Warn / intercept attempts to leave the page while the exam is active
  useEffect(() => {
    if (!exam || submitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    const handleViolation = () => {
      if (showStartOverlay || submitting) return;
      const now = Date.now();
      // Debounce to prevent simultaneous events (e.g. alt-tab triggers both visibility and fullscreen change)
      if (now - lastViolationTimeRef.current < 1000) return;
      lastViolationTimeRef.current = now;

      setFullScreenViolations((prev) => {
        const next = prev + 1;
        if (next === 1) {
          setShowStrikeOneModal(true);
        }
        return next;
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) handleViolation();
    };

    const handleFullscreenChange = () => {
      const isFullscreen =
        Boolean(document.fullscreenElement) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Boolean((document as any).webkitFullscreenElement) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Boolean((document as any).msFullscreenElement);
      if (!isFullscreen) {
        handleViolation();
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      setShowLeaveModal(true);
      // Push the current state back so the back button does not navigate away
      window.history.pushState(null, "", window.location.href);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    window.addEventListener("popstate", handlePopState);
    // Prevent back navigation while in the exam
    window.history.pushState(null, "", window.location.href);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [exam, submitting, showStartOverlay]);

  const questions = exam?.questions || [];
  const currentQ = questions[currentIdx];

  async function handleFinalSubmit(_autoTimedOut = false) {
    void _autoTimedOut;
    if (!exam || submitting) return;
    if (submitLockRef.current || submitting) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setShowConfirmModal(false);
    setShowLeaveModal(false);

    // Calculate scores and counts (handles string or string[] correctAnswer)
    let score = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- computed for diagnostics; correctCount/incorrectCount are persisted per the ExamResult contract
    let unansweredCount = 0;
    const ansObj: Record<string, string> = {};
    questions.forEach((q) => {
      const studentAns = answers[q.id];
      if (studentAns && studentAns.trim() !== "") {
        ansObj[q.id] = studentAns;
        const normalized = studentAns.trim().toLowerCase();
        const correct = q.correctAnswer;
        let matched = false;
        if (Array.isArray(correct)) {
          matched = correct.some((c) => (c || "").trim().toLowerCase() === normalized);
        } else if (typeof correct === "string") {
          matched = correct.trim().toLowerCase() === normalized;
        }
        if (matched) {
          score += q.marks || 2;
          correctCount += 1;
        } else {
          incorrectCount += 1;
        }
      } else {
        unansweredCount += 1;
      }
    });

    const percentage = Math.round((score / (exam.totalMarks || 100)) * 100);
    const passed = percentage >= (exam.passingMarks || 40);

    let currentStudId = "";
    let currentStudEmail = "";
    let currentStudName = candidateName || "";
    let currentCollegeId = "";
    let currentCollegeName = "";
    try {
      const savedRole = localStorage.getItem("lms_role");
      const savedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (savedRole === "admin" || savedRole === "trainer") {
        currentStudId = "admin-1";
        currentStudName = candidateName || "Trainer Preview Mode";
      } else if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u.id || u.uid) currentStudId = u.id || u.uid;
        if (u.email) currentStudEmail = u.email;
        if (u.name) currentStudName = u.name;
        if (u.collegeId) currentCollegeId = u.collegeId;
        if (u.collegeName) currentCollegeName = u.collegeName;
      }
    } catch {}

    if (!currentStudId) {
      setSubmitting(false);
      setAccessDeniedReason("Authentication Required. Unable to identify the student. Please sign in again.");
      return;
    }

    // Duplicate submission guard: re-query attempts before writing
    try {
      const recentAttempts = await getStudentAttemptsForCurrentUser(currentStudId, currentStudEmail);
      const duplicate = recentAttempts.find(
        (a) => a.examId === exam.id && a.status === "submitted"
      );
      if (duplicate) {
        const dupPct = typeof duplicate.percentage === "number" ? duplicate.percentage : percentage;
        const dupPassed = duplicate.passed ?? passed;
        setAccessDeniedReason(
          `Assessment Already Completed. You have already submitted this evaluation. Earned Score: ${dupPct}% (${dupPassed ? "PASSED" : "REVIEW"}).`
        );
        setSubmitting(false);
        return;
      }
    } catch (dupErr) {
      // If the duplicate-check query fails, allow submission rather than blocking the student
    }

    const payload = {
      examId: exam.id,
      examTitle: exam.title,
      studentId: currentStudId,
      studentName: currentStudName,
      studentEmail: currentStudEmail || undefined,
      collegeId: currentCollegeId || undefined,
      collegeName: currentCollegeName || undefined,
      answers: ansObj,
      score,
      totalMarks: exam.totalMarks,
      percentage,
      passed,
      correctCount,
      incorrectCount,
      startTime: startTime ?? new Date(),
      submittedAt: new Date(),
      timeTakenMinutes: Math.ceil((((exam.duration || 0) * 60) - timeLeft) / 60),
      status: "submitted" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("NETWORK_TIMEOUT")), 5000)
      );

      await Promise.race([
        submitExamAttempt(payload),
        timeoutPromise
      ]);

      // Clear persisted in-progress state for this exam so it cannot be restored after submission
      try {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(`lms_exam_${exam.id}`);
        }
      } catch {}
      // Exit fullscreen only AFTER the write succeeded so the student cannot lose
      // fullscreen on a failed submit and lose the ability to retry.
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (document as any).webkitExitFullscreen();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } else if ((document as any).msFullscreenElement && (document as any).msExitFullscreen) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (document as any).msExitFullscreen();
        }
      } catch {}
      const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
      router.push(`${prefix}/results`);
      // Intentionally leave submitting=true so the blocking overlay remains
      // visible until the navigation away from this page completes.
      return;
    } catch (err) {
      if (err instanceof Error && err.message === "NETWORK_TIMEOUT") {
        if (typeof window !== "undefined") {
          localStorage.setItem(`lms_offline_submit_${exam.id}`, JSON.stringify(payload));
          sessionStorage.removeItem(`lms_exam_${exam.id}`);
        }
        setOfflinePending(true);
        return;
      }
      
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Unable to submit your assessment. Please try again.";
      setSubmitError(`Submission failed: ${message}`);
      // Keep the user on the exam page so they can retry; do not redirect
      // and do not exit fullscreen. Clear the submission lock so a retry works.
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  // Active Anti-Cheat (Two-Strike Enforcement & Event Hijacking)
  useEffect(() => {
    // Two-Strike Auto-Submit Trigger
    if (fullScreenViolations >= 2) {
      handleFinalSubmit(true);
    }
  }, [fullScreenViolations]);

  useEffect(() => {
    if (!exam || submitting || showStartOverlay) return;

    const preventDefault = (e: Event) => e.preventDefault();
    const preventShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "v" || e.key === "x" || e.key === "C" || e.key === "V" || e.key === "X")) {
        e.preventDefault();
      }
    };

    window.addEventListener("contextmenu", preventDefault);
    window.addEventListener("copy", preventDefault);
    window.addEventListener("cut", preventDefault);
    window.addEventListener("paste", preventDefault);
    window.addEventListener("dragstart", preventDefault);
    window.addEventListener("drop", preventDefault);
    window.addEventListener("keydown", preventShortcuts);

    return () => {
      window.removeEventListener("contextmenu", preventDefault);
      window.removeEventListener("copy", preventDefault);
      window.removeEventListener("cut", preventDefault);
      window.removeEventListener("paste", preventDefault);
      window.removeEventListener("dragstart", preventDefault);
      window.removeEventListener("drop", preventDefault);
      window.removeEventListener("keydown", preventShortcuts);
    };
  }, [exam, submitting, showStartOverlay]);

  // Countdown timer
  useEffect(() => {
    if (!exam || timeLeft <= 0 || submitting || showStartOverlay) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleFinalSubmit(true); // Auto submit on timer end
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFinalSubmit is a stable function declaration referencing current closures
  }, [exam, timeLeft, submitting, showStartOverlay]);

  const updatePaletteState = (qId: string, state: QuestionPaletteState) => {
    setPaletteStates((prev) => ({ ...prev, [qId]: state }));
  };

  const handleSelectOption = (opt: string) => {
    if (!currentQ) return;
    setAnswers((prev) => ({ ...prev, [currentQ.id]: opt }));
    if (paletteStates[currentQ.id] !== "marked_for_review") {
      updatePaletteState(currentQ.id, "answered");
    }
  };

  const handleInputAnswer = (val: string) => {
    if (!currentQ) return;
    setAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
    if (paletteStates[currentQ.id] !== "marked_for_review") {
      updatePaletteState(currentQ.id, val.trim() !== "" ? "answered" : "not_answered");
    }
  };

  const handleToggleMarkForReview = () => {
    if (!currentQ) return;
    const isMarked = paletteStates[currentQ.id] === "marked_for_review";
    if (isMarked) {
      updatePaletteState(currentQ.id, answers[currentQ.id] ? "answered" : "not_answered");
    } else {
      updatePaletteState(currentQ.id, "marked_for_review");
    }
  };

  const navigateToQuestion = (targetIdx: number) => {
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    // If current question was just visited and has no answer, make sure it is marked 'not_answered'
    if (currentQ && paletteStates[currentQ.id] === "not_visited") {
      updatePaletteState(currentQ.id, "not_answered");
    }
    const nextQ = questions[targetIdx];
    if (nextQ && paletteStates[nextQ.id] === "not_visited") {
      updatePaletteState(nextQ.id, "not_answered");
    }
    setCurrentIdx(targetIdx);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <span className="text-sm font-semibold">Preparing Secure Examination Portal...</span>
      </div>
    );
  }

  if (accessDeniedReason) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 font-sans">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-card border border-border p-8 rounded-3xl shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-foreground">Assessment Access Restricted</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{accessDeniedReason}</p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            {existingAttempt ? (
              <Button onClick={() => {
                const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
                router.push(`${prefix}/results`);
              }} className="w-full h-11 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold">
                View Transcript & Results
              </Button>
            ) : null}
            <Button onClick={() => {
              const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
              router.push(`${prefix}/exams`);
            }} variant="outline" className="w-full h-11 rounded-xl font-bold">
              Return to Exams List
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!exam || questions.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <h2 className="text-xl font-bold">Examination Not Available</h2>
        <p className="text-sm text-muted-foreground">This test could not be loaded or has no published questions.</p>
        <Button onClick={() => {
          const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
          router.push(`${prefix}/exams`);
        }} variant="outline">
          Return to Dashboard
        </Button>
      </div>
    );
  }

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  const answeredCount = Object.values(paletteStates).filter((s) => s === "answered").length;
  const reviewCount = Object.values(paletteStates).filter((s) => s === "marked_for_review").length;
  const unansweredCount = questions.length - answeredCount - reviewCount;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between select-none exam-container" style={{ WebkitTouchCallout: 'none' }}>
      <style>{`
        .exam-container input, 
        .exam-container textarea, 
        .exam-container [contenteditable="true"] {
          user-select: text !important;
          -webkit-user-select: text !important;
        }
      `}</style>
      {/* Top Header Bar */}
      <header className="h-16 border-b border-border px-6 flex items-center justify-between bg-card/80 backdrop-blur-md sticky top-0 z-40 shadow-sm">
        <div className="flex items-center">
          <div>
            <h1 className="font-bold text-sm sm:text-base leading-tight text-foreground">{exam.title}</h1>
            <p className="text-[11px] text-muted-foreground">Subject: {(exam as any).subject || "General Assessment"} • {exam.totalMarks || 0} Marks</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono font-bold text-sm ${
            timeLeft < 300 ? "bg-red-500/15 border-red-500 text-red-500 animate-pulse" : "bg-muted border-border text-foreground"
          }`}>
            <Clock className="w-4 h-4 text-brand" />
            <span>{timeFormatted}</span>
          </div>

          <ThemeToggle />

          <Button
            onClick={() => setShowConfirmModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 shadow-sm"
          >
            Finish & Submit
          </Button>
        </div>
      </header>

      {/* Submission Error Banner (dismissible, non-intrusive) */}
      {submitError && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-foreground flex-1 leading-relaxed">{submitError}</p>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 -m-1 rounded-md focus:outline-none focus:ring-2 focus:ring-destructive/40"
              aria-label="Dismiss submission error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Examination Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6">
        {/* Question Area (8 columns) */}
        <div className="lg:col-span-8 flex flex-col justify-between rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6 shadow-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-brand/15 text-brand font-bold text-xs border border-brand/20">
                  Question {currentIdx + 1} of {questions.length}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">Marks: {currentQ?.marks || 2} marks</span>
              </div>

              <button
                onClick={handleToggleMarkForReview}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all shadow-sm ${
                  paletteStates[currentQ?.id] === "marked_for_review"
                    ? "bg-purple-600 border-purple-600 text-white shadow-md"
                    : "border-border bg-card hover:bg-accent text-foreground"
                }`}
              >
                <Bookmark className="w-4 h-4" />
                <span>{paletteStates[currentQ?.id] === "marked_for_review" ? "Marked for Review" : "Mark for Review"}</span>
              </button>
            </div>

            <p className="text-base sm:text-lg font-semibold leading-relaxed pt-2 text-foreground">{currentQ?.text}</p>
          </div>

          {/* Options / Blank Input */}
          <div className="my-auto py-4">
            {currentQ?.type === "fill-blank" || currentQ?.type === "short-answer" ? (
              <div className="space-y-3 p-6 rounded-2xl border border-border bg-muted/20">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Type your answer in the blank below:</label>
                <input
                  type="text"
                  placeholder="Enter your exact answer here..."
                  value={answers[currentQ.id] || ""}
                  onChange={(e) => handleInputAnswer(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-border bg-background text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand shadow-sm"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {currentQ?.options?.map((opt, idx) => {
                  const isSelected = answers[currentQ.id] === opt;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(opt)}
                      className={`p-4 rounded-xl border-2 text-left text-sm font-medium transition-all flex items-center gap-3.5 outline-none focus:outline-none ${
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500 text-foreground font-bold shadow-md ring-2 ring-emerald-500/30"
                          : "border-border bg-background hover:bg-accent/40 text-foreground hover:border-border/80"
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? "bg-brand text-white shadow-sm" : "bg-muted text-muted-foreground border border-border"
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

          {/* Bottom Navigation Controls */}
          <div className="flex items-center justify-between pt-5 border-t border-border mt-4">
            <Button
              onClick={() => navigateToQuestion(currentIdx - 1)}
              disabled={currentIdx === 0}
              variant="outline"
              className="h-11 px-5 rounded-xl border-2 border-border bg-card text-foreground font-bold hover:bg-accent shadow-sm disabled:opacity-40 outline-none focus:outline-none"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Previous Question
            </Button>

            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Auto-save active
            </span>

            <Button
              onClick={() => navigateToQuestion(currentIdx + 1)}
              disabled={currentIdx === questions.length - 1}
              className="h-11 px-6 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold shadow-md disabled:opacity-40 outline-none focus:outline-none"
            >
              Save & Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* 4-State Question Palette Sidebar (4 columns) */}
        <div className="lg:col-span-4 rounded-2xl border border-border bg-card p-6 flex flex-col justify-between space-y-6 shadow-md">
          <div className="space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2 border-b border-border pb-3 text-foreground">
              <ShieldCheck className="w-4 h-4 text-brand" />
              <span>Question Navigation Palette</span>
            </h3>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-emerald-600 shadow-sm" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-amber-500/20" />
                <span>Not Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-purple-600 shadow-sm" />
                <span>Marked ({reviewCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-muted" />
                <span>Not Visited</span>
              </div>
            </div>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-4 p-4 max-h-80 overflow-y-auto">
              {questions.map((q, idx) => {
                const state = paletteStates[q.id] || "not_visited";
                const isCurrent = currentIdx === idx;
                let bgStyle = "bg-muted/70 dark:bg-white/[0.06] text-foreground/80 hover:bg-accent hover:text-foreground font-semibold";
                if (state === "answered") bgStyle = "bg-emerald-600 text-white font-bold shadow-sm";
                else if (state === "not_answered") bgStyle = "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold";
                else if (state === "marked_for_review") bgStyle = "bg-purple-600 text-white font-bold shadow-sm";

                return (
                  <button
                    key={q.id}
                    onClick={() => navigateToQuestion(idx)}
                    className={`w-10 h-10 rounded-xl text-xs flex items-center justify-center transition-all duration-200 ease-in-out outline-none focus:outline-none select-none ${bgStyle} ${
                      isCurrent
                        ? "ring-4 ring-emerald-500/80 ring-offset-2 ring-offset-card border-2 border-white dark:border-white font-black scale-110 shadow-xl z-10"
                        : "border border-transparent hover:scale-105 opacity-90 hover:opacity-100"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              onClick={() => setShowConfirmModal(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 flex items-center justify-center gap-2 shadow-md"
            >
              <Send className="w-4 h-4" />
              <span>Submit Assessment</span>
            </Button>
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Confirm Submission</h3>
                  <p className="text-xs text-muted-foreground">Review your attempt summary before final submission.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3.5 rounded-xl bg-muted/40 border border-border text-center text-xs">
                <div>
                  <span className="text-muted-foreground font-semibold">Answered</span>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{answeredCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-semibold">Marked</span>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{reviewCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-semibold">Unanswered</span>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{unansweredCount}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Once submitted, you cannot alter your responses. Results will be calculated automatically based on trainer configuration.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={() => setShowConfirmModal(false)} variant="outline" className="border-border text-foreground font-semibold">
                  Continue Exam
                </Button>
                <Button
                  onClick={() => handleFinalSubmit(false)}
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                >
                  {submitting ? "Submitting..." : "Yes, Submit Final Answers"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fullscreen / Exit Intercept Modal */}
      <AnimatePresence>
        {showLeaveModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Exit Full Screen Detected</h3>
                  <p className="text-xs text-muted-foreground">The assessment must remain fullscreen.</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Leaving the exam area pauses the assessment. You can re-enter fullscreen to continue, or end the exam now. If you choose to end, your current answers will be submitted.
              </p>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button
                  onClick={() => {
                    setShowLeaveModal(false);
                    enterFullscreen();
                  }}
                  variant="outline"
                  className="border-border text-foreground font-semibold"
                >
                  Re-enter Full Screen
                </Button>
                <Button
                  onClick={() => handleFinalSubmit(true)}
                  disabled={submitting}
                  className="bg-destructive hover:bg-destructive/90 text-white font-bold shadow-sm"
                >
                  {submitting ? "Ending Exam..." : "End Exam & Submit"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Strike One Warning Modal */}
      <AnimatePresence>
        {showStrikeOneModal && !submitting && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-2xl border border-destructive bg-card p-6 sm:p-8 shadow-2xl space-y-6 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-bold text-foreground">Security Warning: Full Screen Exited</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You have exited Full Screen Mode. <strong>This is your first and only warning.</strong> If you exit Full Screen again, your examination will be immediately terminated and automatically submitted.
                </p>
              </div>
              <Button
                onClick={async () => {
                  setShowStrikeOneModal(false);
                  await enterFullscreen();
                }}
                className="w-full h-11 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
              >
                Return to Exam
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Start Exam Fullscreen Overlay */}
      <AnimatePresence>
        {showStartOverlay && !loading && exam && questions.length > 0 && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/95 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-lg rounded-3xl border border-emerald-500/30 bg-card p-8 shadow-2xl space-y-6 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Start Secure Assessment</h2>
                <p className="text-sm text-muted-foreground">
                  {exam.title}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left text-xs">
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-muted-foreground font-semibold">Questions</span>
                  <p className="text-lg font-bold text-foreground">{questions.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-muted-foreground font-semibold">Duration</span>
                  <p className="text-lg font-bold text-foreground">{(exam.duration || 0) || 30} mins</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-muted-foreground font-semibold">Total Marks</span>
                  <p className="text-lg font-bold text-foreground">{exam.totalMarks || 100}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <span className="text-muted-foreground font-semibold">Passing Marks</span>
                  <p className="text-lg font-bold text-foreground">{exam.passingMarks || 40}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                This assessment runs in fullscreen mode. Do not refresh, switch tabs, or press Escape. Doing so will trigger an exit confirmation and may end the exam.
              </p>

              <Button
                onClick={handleStartExam}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
              >
                Enter Full Screen & Begin Exam
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submission Loading Overlay - blocks all interaction until redirect completes */}
      <AnimatePresence>
        {submitting && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-live="assertive"
            aria-busy="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl space-y-5 text-center"
            >
              <div className="flex items-center justify-center">
                {offlinePending ? (
                  <CheckCircle2 className="w-16 h-16 text-amber-500" />
                ) : (
                  <div className="w-14 h-14 rounded-full border-4 border-brand border-t-transparent animate-spin" />
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-foreground">
                  {offlinePending
                    ? "Exam Submitted (Offline Pending)"
                    : fullScreenViolations >= 2
                    ? "Security Termination"
                    : "Submitting your assessment..."}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {offlinePending
                    ? "Your exam was saved locally due to a network issue. It will be synced when you reconnect."
                    : fullScreenViolations >= 2
                    ? "Your exam was automatically submitted due to multiple full-screen violations. Processing results..."
                    : "Please wait. Do not close this window, refresh the page, or press the back button."}
                </p>
              </div>
              {offlinePending && (
                <div className="pt-4">
                  <Button
                    onClick={() => {
                      const prefix = typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "/admin" : "/student";
                      router.push(`${prefix}/exams`);
                    }}
                    className="w-full"
                  >
                    Return to Dashboard
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
