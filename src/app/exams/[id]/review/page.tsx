"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { QuestionReview } from "@/components/assessment/question-review";
import { ThemeToggle } from "@/components/shared/theme-toggle";

import {
  getExamById,
  getStudentAttemptsForCurrentUser,
} from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { formatTimestamp } from "@/lib/utils/date";

import { getDocuments, where } from "@/lib/firebase/firestore";
import type { Exam, ExamAttempt, ExamResult } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

type AnswerMap = Record<string, string | string[] | undefined>;

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

function resolveBackHref(): string {
  if (typeof window === "undefined") return "/exams";
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return "/admin/exams";
  if (path.startsWith("/student")) return "/student/exams";
  return "/exams";
}

function resolveResultsHref(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return "/admin/results";
  if (path.startsWith("/student")) return "/student/results";
  return null;
}

function isAdminLikePath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/admin");
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  return String(value);
}

function isQuestionCorrect(question: { correctAnswer: string | string[] }, answer: string | string[] | undefined): boolean {
  if (answer === undefined || answer === null) return false;
  const normalize = (input: unknown) => (typeof input === "string" ? input.trim().toLowerCase() : "");

  if (Array.isArray(question.correctAnswer)) {
    const correctSet = new Set(question.correctAnswer.map((c) => normalize(c)));
    const studentArr = Array.isArray(answer) ? answer : [answer];
    return studentArr.length > 0 && studentArr.every((s) => correctSet.has(normalize(s)));
  }

  return normalize(question.correctAnswer) === normalize(answer);
}

export default function ReviewExamPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDeniedReason, setAccessDeniedReason] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const id = resolvedParams.id;

        const role = resolveRoleFromStorage();
        const isStudentPath = typeof window !== "undefined" && window.location.pathname.startsWith("/student");
        const isAdminPath = isAdminLikePath();

        // For students, resolve via Firebase auth so the attempt query is scoped correctly.
        let uid = "";
        let email = "";
        let profileId = "";

        const me = await getCurrentUser().catch(() => null);
        if (me) {
          uid = me.uid;
          email = me.email || "";
          profileId = (me.profile?.id as string) || (me.profile?.uid as string) || "";
        }

        if (!uid || !email) {
          try {
            const stored = localStorage.getItem("lms_user") || localStorage.getItem("user");
            if (stored) {
              const parsed = JSON.parse(stored);
              uid = uid || parsed?.id || parsed?.uid || "";
              email = email || parsed?.email || "";
              profileId = profileId || parsed?.id || parsed?.studentId || "";
            }
          } catch {}
        }

        const [examData, attempts] = await Promise.all([
          getExamById(id).catch(() => null),
          (uid || email || profileId)
            ? getStudentAttemptsForCurrentUser(uid, email, profileId).catch(() => [] as ExamAttempt[])
            : Promise.resolve([] as ExamAttempt[]),
        ]);

        if (!examData) {
          setAccessDeniedReason("Assessment Not Found. This evaluation has been removed or is unavailable.");
          setLoading(false);
          return;
        }

        let submitted = attempts.find(
          (a) => a.examId === id && (a.status === "submitted" || (a.answers && Object.keys(a.answers).length > 0)),
        );

        // Fallback: If not found in user attempts, query results directly by examId
        if (!submitted) {
          try {
            const examResults = await getDocuments<ExamResult>("exam_results", [
              where("examId", "==", id),
            ]);
            const matched = examResults.find((a: any) => {
              const normEmail = email.toLowerCase().trim();
              return (
                (uid && a.studentId === uid) ||
                (profileId && a.studentId === profileId) ||
                (normEmail && a.studentId?.toLowerCase() === normEmail) ||
                (normEmail && a.studentEmail?.toLowerCase() === normEmail)
              );
            });
            if (matched) {
              submitted = matched as ExamAttempt;
            }
          } catch {}
        }

        if (!submitted) {
          setAccessDeniedReason("No submitted attempt found for this evaluation. You may need to complete the assessment first.");
          setLoading(false);
          return;
        }

        setExam(examData);
        setAttempt(submitted);
      } catch (err) {
        console.error("Failed to load review", err);
        setAccessDeniedReason("Unable to load the review. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [resolvedParams.id, router]);

  const questions = useMemo(() => exam?.questions || [], [exam]);
  const currentQ = questions[currentIdx];
  const answers: AnswerMap = useMemo(() => {
    if (!attempt?.answers) return {};
    const raw = attempt.answers as Record<string, unknown>;
    const result: AnswerMap = {};
    for (const [qid, value] of Object.entries(raw)) {
      if (value === null || value === undefined) {
        result[qid] = undefined;
      } else if (Array.isArray(value)) {
        result[qid] = value.map((v) => asString(v));
      } else {
        result[qid] = asString(value);
      }
    }
    return result;
  }, [attempt]);

  const counts = useMemo(() => {
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    questions.forEach((q) => {
      const studentAns = answers[q.id];
      if (studentAns === undefined || (typeof studentAns === "string" && studentAns.trim() === "")) {
        unansweredCount += 1;
        return;
      }
      if (isQuestionCorrect(q, studentAns)) {
        correctCount += 1;
      } else {
        incorrectCount += 1;
      }
    });

    // Prefer persisted counts when available so values match the official result document.
    if (attempt) {
      if (typeof attempt.correctCount === "number") correctCount = attempt.correctCount;
      if (typeof attempt.incorrectCount === "number") incorrectCount = attempt.incorrectCount;
      if (correctCount + incorrectCount > questions.length) {
        // Persisted counts exceed the question count; fall back to the computed value.
        correctCount = 0;
        incorrectCount = 0;
        questions.forEach((q) => {
          const studentAns = answers[q.id];
          if (studentAns === undefined || (typeof studentAns === "string" && studentAns.trim() === "")) {
            unansweredCount += 1;
          } else if (isQuestionCorrect(q, studentAns)) {
            correctCount += 1;
          } else {
            incorrectCount += 1;
          }
        });
      }
    }

    unansweredCount = Math.max(0, questions.length - correctCount - incorrectCount);

    return { correctCount, incorrectCount, unansweredCount };
  }, [questions, answers, attempt]);

  const navigateToQuestion = (targetIdx: number) => {
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    setCurrentIdx(targetIdx);
    setPaletteOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <span className="text-sm font-semibold">Preparing review transcript...</span>
      </div>
    );
  }

  if (accessDeniedReason) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-card border border-border p-8 rounded-3xl shadow-2xl text-center space-y-6"
        >
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-foreground">Review Unavailable</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{accessDeniedReason}</p>
          </div>
          <Button
            onClick={() => router.push(resolveBackHref())}
            className="w-full h-11 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold"
          >
            Back to Examinations
          </Button>
        </motion.div>
      </div>
    );
  }

  if (!exam || !attempt || questions.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <h2 className="text-xl font-bold">Review Not Available</h2>
        <p className="text-sm text-muted-foreground">This assessment has no questions to review.</p>
        <Button onClick={() => router.push(resolveBackHref())} variant="outline">
          Back to Examinations
        </Button>
      </div>
    );
  }

  const score = typeof attempt.score === "number" ? attempt.score : 0;
  const totalMarks = exam.totalMarks || attempt.totalMarks || 0;
  const percentage = typeof attempt.percentage === "number" ? attempt.percentage : 0;
  const passed = attempt.passed ?? (totalMarks > 0 ? percentage >= (exam.passingMarks || 40) : false);
  const timeTaken =
    typeof attempt.timeTakenMinutes === "number"
      ? attempt.timeTakenMinutes
      : typeof attempt.timeTaken === "number"
        ? attempt.timeTaken
        : null;
  const submittedAt = formatTimestamp(attempt.submittedAt || attempt.createdAt || attempt.updatedAt, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const resultsHref = resolveResultsHref();

  const passBadgeClasses = passed
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
    : "bg-destructive/15 text-destructive border-destructive/30";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-border px-4 sm:px-6 flex items-center justify-between bg-card/80 backdrop-blur-md sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            onClick={() => router.push(resolveBackHref())}
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-foreground"
            aria-label="Back to examinations"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1.5">Back</span>
          </Button>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base leading-tight text-foreground truncate">
              {exam.title}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">Post-Exam Review</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${passBadgeClasses}`}
          >
            {passed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Passed
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                Review
              </>
            )}
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Review Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Summary Panel */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-sm space-y-5"
          aria-label="Attempt summary"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`sm:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${passBadgeClasses}`}
                >
                  {passed ? "Passed" : "Review"}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Attempt Summary
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-foreground leading-tight">
                {exam.title}
              </h2>
              {attempt.studentName && resolveRoleFromStorage() !== "student" && (
                <p className="text-xs text-muted-foreground">Student: {attempt.studentName}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Final Score
                </p>
                <p className="text-2xl font-extrabold text-foreground leading-none">
                  {score} <span className="text-sm text-muted-foreground font-bold">/ {totalMarks}</span>
                </p>
              </div>
              <div className="h-12 w-px bg-border" />
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Percentage
                </p>
                <p
                  className={`text-2xl font-extrabold leading-none ${
                    passed
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }`}
                >
                  {percentage}%
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <SummaryTile
              icon={passed ? CheckCircle2 : XCircle}
              label="Result"
              value={passed ? "Passed" : "Review"}
              tone={passed ? "emerald" : "rose"}
            />
            <SummaryTile
              icon={Clock}
              label="Time Taken"
              value={timeTaken !== null ? `${timeTaken} min` : "—"}
              tone="brand"
            />
            <SummaryTile
              icon={ShieldCheck}
              label="Submitted At"
              value={submittedAt || "—"}
              tone="purple"
            />
            <SummaryTile
              icon={CheckCircle2}
              label="Correct"
              value={`${counts.correctCount}`}
              tone="emerald"
            />
            <SummaryTile
              icon={XCircle}
              label="Incorrect / Unanswered"
              value={`${counts.incorrectCount} / ${counts.unansweredCount}`}
              tone="amber"
            />
          </div>
        </motion.section>

        {/* Mobile palette toggle */}
        <div className="lg:hidden">
          <Button
            onClick={() => setPaletteOpen((prev) => !prev)}
            variant="outline"
            className="w-full h-11 rounded-xl border-border bg-card text-foreground font-bold"
          >
            {paletteOpen ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                Hide Question Palette
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Show Question Palette
              </>
            )}
          </Button>
        </div>

        {/* Workspace: palette + review area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Question Palette (4 columns on desktop) */}
          <aside
            className={`lg:col-span-4 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-md space-y-5 ${
              paletteOpen ? "block" : "hidden lg:block"
            }`}
            aria-label="Question palette"
          >
            <div className="space-y-4">
              <h3 className="font-bold text-sm flex items-center gap-2 border-b border-border pb-3 text-foreground">
                <ShieldCheck className="w-4 h-4 text-brand" />
                <span>Question Palette</span>
              </h3>

              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-600 shadow-sm" />
                  <span>Correct ({counts.correctCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-rose-500 shadow-sm" />
                  <span>Incorrect ({counts.incorrectCount})</span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <span className="w-3.5 h-3.5 rounded bg-muted border border-border" />
                  <span>Unanswered ({counts.unansweredCount})</span>
                </div>
              </div>

              {/* Grid of question buttons */}
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-4 p-4 max-h-96 overflow-y-auto">
                {questions.map((q, idx) => {
                  const studentAns = answers[q.id];
                  const hasAnswer =
                    studentAns !== undefined &&
                    !(typeof studentAns === "string" && studentAns.trim() === "");
                  const isCorrect = hasAnswer && isQuestionCorrect(q, studentAns);
                  const isCurrent = currentIdx === idx;

                  let bgStyle =
                    "bg-muted/70 dark:bg-white/[0.06] text-foreground/80 hover:bg-accent hover:text-foreground font-semibold";
                  if (hasAnswer && isCorrect) {
                    bgStyle = "bg-emerald-600 text-white font-bold shadow-sm";
                  } else if (hasAnswer && !isCorrect) {
                    bgStyle = "bg-rose-500 text-white font-bold shadow-sm";
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => navigateToQuestion(idx)}
                      className={`w-10 h-10 rounded-xl text-xs flex items-center justify-center transition-all outline-none focus:outline-none select-none ${bgStyle} ${
                        isCurrent
                          ? "ring-4 ring-brand/80 ring-offset-2 ring-offset-card border-2 border-white dark:border-white font-black scale-110 shadow-xl z-10"
                          : "border border-transparent hover:scale-105 opacity-90 hover:opacity-100"
                      }`}
                      aria-label={`Go to question ${idx + 1}`}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {resultsHref && (
              <div className="pt-4 border-t border-border">
                <Button
                  onClick={() => router.push(resultsHref)}
                  className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold h-11 flex items-center justify-center gap-2 shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>Back to Results</span>
                </Button>
              </div>
            )}
          </aside>

          {/* Question Review Area (8 columns on desktop) */}
          <section
            className="lg:col-span-8 rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-md space-y-6"
            aria-label="Question review"
          >
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-brand/15 text-brand font-bold text-xs border border-brand/20">
                  Question {currentIdx + 1} of {questions.length}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  Marks: {currentQ?.marks ?? 1}
                </span>
              </div>
            </div>

            {currentQ && (
              <QuestionReview
                question={currentQ}
                index={currentIdx}
                studentAnswer={answers[currentQ.id]}
                showCorrectAnswer={true}
              />
            )}

            {/* Navigation Controls */}
            <div className="flex items-center justify-between pt-5 border-t border-border">
              <Button
                onClick={() => navigateToQuestion(currentIdx - 1)}
                disabled={currentIdx === 0}
                variant="outline"
                className="h-11 px-5 rounded-xl border-2 border-border bg-card text-foreground font-bold hover:bg-accent shadow-sm disabled:opacity-40"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Previous
              </Button>

              <span className="text-xs font-bold text-muted-foreground hidden sm:inline">
                Viewing question {currentIdx + 1} of {questions.length}
              </span>

              <Button
                onClick={() => navigateToQuestion(currentIdx + 1)}
                disabled={currentIdx === questions.length - 1}
                className="h-11 px-6 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold shadow-md disabled:opacity-40"
              >
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

interface SummaryTileProps {
  icon: typeof Clock;
  label: string;
  value: string;
  tone: "brand" | "emerald" | "amber" | "rose" | "purple";
}

function SummaryTile({ icon: Icon, label, value, tone }: SummaryTileProps) {
  const toneClasses: Record<SummaryTileProps["tone"], string> = {
    brand: "bg-brand/10 text-brand",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3.5 flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneClasses[tone]}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="space-y-0.5 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </p>
        <p className="text-sm font-extrabold text-foreground leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}
