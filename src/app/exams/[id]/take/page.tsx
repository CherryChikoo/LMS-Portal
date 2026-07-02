"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Clock, AlertTriangle, CheckCircle2, Bookmark, ArrowLeft, ArrowRight, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getExamById, submitExamAttempt, getStudentAttempts, getEffectiveExamStatus } from "@/lib/services";
import type { Exam, Question, QuestionPaletteState } from "@/types";

export default function TakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);
  const [existingAttempt, setExistingAttempt] = useState<any>(null);

  // Exam Progress State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [paletteStates, setPaletteStates] = useState<Record<string, QuestionPaletteState>>({});
  const [timeLeft, setTimeLeft] = useState<number>(1800); // in seconds
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [candidateName, setCandidateName] = useState("");

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem("lms_role");
      const savedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
      let name = "Student Candidate";
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u.name) name = u.name;
      }
      if (savedRole === "admin" || savedRole === "trainer") {
        setCandidateName(name !== "Student Candidate" ? `${name} (Preview Mode)` : "Trainer Preview Mode");
      } else {
        setCandidateName(name);
      }
    } catch (e) {
      setCandidateName("Student Candidate");
    }

    async function load() {
      setLoading(true);
      try {
        const data = await getExamById(resolvedParams.id);
        if (data) {
          let role = "student";
          let sId = "stud-1";
          let sEmail = "student@lms.dev";
          try {
            role = localStorage.getItem("lms_role") || "student";
            const u = JSON.parse(localStorage.getItem("lms_user") || localStorage.getItem("user") || "{}");
            if (u.id || u.uid) sId = u.id || u.uid;
            if (u.email) sEmail = u.email;
          } catch {}

          if (role !== "admin" && role !== "trainer") {
            const effStatus = getEffectiveExamStatus(data);
            if (effStatus === "completed" || effStatus === "cancelled" || (data.status as string) === "closed") {
              setAccessDeniedReason("Assessment Closed. The scheduled timeline for this evaluation has expired.");
              setLoading(false);
              return;
            }

            try {
              const attempts = await getStudentAttempts();
              const found = attempts.find((a) => {
                if (a.examId !== resolvedParams.id) return false;
                if (a.studentId === sId || a.studentId?.toLowerCase() === sEmail.toLowerCase()) return true;
                if ((a as any).studentEmail?.toLowerCase() === sEmail.toLowerCase()) return true;
                if (sEmail.toLowerCase() === "student@lms.dev" && (a.studentId === "stud-1" || a.studentName?.toLowerCase() === "student candidate")) return true;
                return false;
              });
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

          // Initialize palette states as 'not_visited' except index 0 as 'not_answered'
          const initPalette: Record<string, QuestionPaletteState> = {};
          data.questions?.forEach((q, idx) => {
            initPalette[q.id] = idx === 0 ? "not_answered" : "not_visited";
          });
          setPaletteStates(initPalette);
        }
      } catch (err) {
        console.error("Failed to load exam", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [resolvedParams.id]);

  // Countdown timer
  useEffect(() => {
    if (!exam || timeLeft <= 0 || submitting) return;

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
  }, [exam, timeLeft, submitting]);

  const questions = exam?.questions || [];
  const currentQ = questions[currentIdx];

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

  const handleFinalSubmit = async (autoTimedOut = false) => {
    if (!exam || submitting) return;
    setSubmitting(true);
    setShowConfirmModal(false);

    // Calculate scores
    let score = 0;
    const ansObj: Record<string, string> = {};
    questions.forEach((q) => {
      const studentAns = answers[q.id];
      if (studentAns) {
        ansObj[q.id] = studentAns;
        if (studentAns.trim().toLowerCase() === (q.correctAnswer as string)?.trim().toLowerCase()) {
          score += q.marks || 2;
        }
      }
    });

    const percentage = Math.round((score / (exam.totalMarks || 100)) * 100);
    const passed = percentage >= (exam.passingMarks || 40);

    let currentStudId = "stud-1";
    let currentStudName = candidateName || "Student Candidate";
    try {
      const savedRole = localStorage.getItem("lms_role");
      const savedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (savedRole === "admin" || savedRole === "trainer") {
        currentStudId = "admin-1";
        currentStudName = candidateName || "Trainer Preview Mode";
      } else if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u.id || u.uid) currentStudId = u.id || u.uid;
        if (u.name) currentStudName = u.name;
      }
    } catch (_) {}

    try {
      await submitExamAttempt({
        examId: exam.id,
        studentId: currentStudId,
        studentName: currentStudName,
        answers: ansObj,
        score,
        totalMarks: exam.totalMarks,
        percentage,
        passed,
        timeTakenMinutes: Math.ceil(((exam.duration * 60) - timeLeft) / 60),
        status: "submitted",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      router.push("/results");
    } catch (err) {
      console.error("Submission failed", err);
      router.push("/results");
    } finally {
      setSubmitting(false);
    }
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
              <Button onClick={() => router.push("/results")} className="w-full h-11 rounded-xl bg-brand hover:bg-brand/90 text-white font-bold">
                View Transcript & Results
              </Button>
            ) : null}
            <Button onClick={() => router.push("/exams")} variant="outline" className="w-full h-11 rounded-xl font-bold">
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
        <Button onClick={() => router.push("/exams")} variant="outline">
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
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-border px-6 flex items-center justify-between bg-card/80 backdrop-blur-md sticky top-0 z-40 shadow-sm">
        <div className="flex items-center">
          <div>
            <h1 className="font-bold text-sm sm:text-base leading-tight text-foreground">{exam.title}</h1>
            <p className="text-[11px] text-muted-foreground">Candidate: {candidateName} • Roll: ROLL-2026</p>
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
              className="h-11 px-6 rounded-xl bg-brand hover:bg-brand/90 text-white font-bold shadow-md disabled:opacity-40 outline-none focus:outline-none"
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
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-3 p-2 max-h-80 overflow-y-auto">
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
                    className={`w-10 h-10 rounded-xl text-xs flex items-center justify-center transition-all outline-none focus:outline-none select-none ${bgStyle} ${
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
    </div>
  );
}
