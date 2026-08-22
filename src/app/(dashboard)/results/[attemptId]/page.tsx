"use client";

import { use, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuestionReview } from "@/components/assessment/question-review";
import { supabase } from "@/lib/supabase/client";
import {
  getExamById,
  getAllExamsIncludingDeleted,
} from "@/lib/services";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";
import { fadeInUp } from "@/lib/animations";
import type { Exam, ExamResult, Student } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTimestamp(val: any): string {
  if (!val) return "—";
  try {
    if (typeof val?.toDate === "function") {
      return val.toDate().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (val?.seconds) {
      return new Date(val.seconds * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {
    // fallback below
  }
  return "—";
}

export default function AttemptAnswerSheetPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = use(params);
  const pathname = usePathname();
  const router = useRouter();

  const [attempt, setAttempt] = useState<ExamResult | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const students = useLMSDataSelector((s) => s.students);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const questionsPerPage = 5;

  const isAdminRoute = pathname?.startsWith("/admin") ?? false;
  const backHref = isAdminRoute ? "/admin/results" : "/results";

  useEffect(() => {
    let cancelled = false;

    async function loadAttempt() {
      setLoading(true);
      try {
        // Fetch exam_results with joined student and exam data
        const { data: fetched } = await supabase
          .from('exam_results')
          .select(`
            *,
            students (
              users (
                displayName,
                email
              ),
              colleges (
                name
              ),
              department,
              academicYear,
              section
            ),
            exams (
              title,
              collegeId
            )
          `)
          .eq('id', attemptId)
          .single();
          
        if (cancelled) return;

        if (!fetched) {
          setAttempt(null);
          setLoading(false);
          return;
        }

        // Flatten the student data into the attempt object for easier access
        const attemptWithStudentData = {
          ...fetched,
          studentName: (fetched as any).students?.users?.displayName || fetched.studentName || "Unknown Student",
          studentEmail: (fetched as any).students?.users?.email || "",
          collegeName: (fetched as any).students?.colleges?.name || "",
          department: (fetched as any).students?.department || "",
          academicYear: (fetched as any).students?.academicYear || "",
          section: (fetched as any).students?.section || "",
          examTitle: (fetched as any).exams?.title || fetched.examTitle || "Unknown Exam",
        };

        setAttempt(attemptWithStudentData);

        const resolvedExam = await getExamById(fetched.examId).catch(() => null);

        if (cancelled) return;

        if (resolvedExam) {
          setExam(resolvedExam);
        } else {
          try {
            const allExams = await getAllExamsIncludingDeleted();
            if (cancelled) return;
            const found = allExams.data.find((e) => e.id === fetched.examId) ?? null;
            setExam(found);
          } catch {
            if (!cancelled) setExam(null);
          }
        }
      } catch (err) {
        console.error("Failed to load attempt answer sheet", err);
        if (!cancelled) setAttempt(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAttempt();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const studentName = useMemo(() => {
    if (!attempt) return "Unknown Student";
    // Use the studentName from the flattened data (already resolved from join)
    return (attempt as any).studentName || "Unknown Student";
  }, [attempt]);

  const examTitle = useMemo(() => {
    if (!attempt) return "Deleted Assessment";
    if (exam?.title) return exam.title;
    // Use the examTitle from the flattened data (already resolved from join)
    return (attempt as any).examTitle || "Deleted Assessment";
  }, [attempt, exam]);

  const timeTaken = useMemo(() => {
    if (!attempt) return 0;
    return attempt.timeTakenMinutes ?? attempt.timeTaken ?? 0;
  }, [attempt]);

  const submissionTimestamp = useMemo(() => {
    if (!attempt) return "—";
    return formatTimestamp(attempt.submittedAt ?? attempt.updatedAt ?? attempt.createdAt);
  }, [attempt]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <span className="text-sm font-medium">Loading answer sheet...</span>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <EmptyState
          icon={FileText}
          title="Answer sheet not found"
          description="The requested attempt could not be located. It may have been deleted or the link is invalid."
          actionLabel="Back to Results"
          onAction={() => router.push(backHref)}
        />
      </div>
    );
  }

  const passed = Boolean(attempt.passed);
  const questions = exam?.questions ?? [];
  const hasQuestions = questions.length > 0;
  
  // Pagination logic
  const totalPages = Math.ceil(questions.length / questionsPerPage);
  const startIndex = (currentPage - 1) * questionsPerPage;
  const endIndex = startIndex + questionsPerPage;
  const paginatedQuestions = questions.slice(startIndex, endIndex);

  return (
    <div
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- motion prop typing kept loose for compat
      {...({ initial: "hidden", animate: "visible", variants: fadeInUp } as any)}
      className="space-y-6 max-w-[1400px] mx-auto pb-12 font-sans"
    >
      <div className="flex items-center justify-between gap-3">
        <Button
          onClick={() => router.push(backHref)}
          variant="outline"
          size="sm"
          className="h-9 px-3 border-border bg-card hover:bg-accent text-foreground font-semibold flex items-center gap-1.5 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Results
        </Button>
      </div>

      <PageHeader
        title="Student Answer Sheet"
        description="Review the student's full response transcript, including selected answers and the correct solutions."
      />

      {/* Summary Header */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4 mb-5">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Examination
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground leading-tight truncate">
              {examTitle}
            </h2>
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <GraduationCap className="w-3.5 h-3.5 text-brand" />
              <span className="font-semibold">{studentName}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                passed
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold uppercase tracking-wider text-[11px]"
                  : "border-destructive/30 bg-destructive/15 text-destructive font-extrabold uppercase tracking-wider text-[11px]"
              }
            >
              {passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              ) : (
                <XCircle className="w-3.5 h-3.5 mr-1" />
              )}
              {passed ? "PASSED" : "FAILED"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <Award className="w-3.5 h-3.5 text-brand" />
              Score
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              {attempt.score}
              <span className="text-xs font-medium text-muted-foreground">
                {" "}
                / {attempt.totalMarks} marks
              </span>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-brand" />
              Percentage
            </div>
            <p
              className={`text-2xl font-extrabold ${
                passed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive"
              }`}
            >
              {attempt.percentage}%
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-brand" />
              Time Taken
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              {timeTaken}
              <span className="text-xs font-medium text-muted-foreground"> mins</span>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-brand" />
              Submitted
            </div>
            <p className="text-sm font-bold text-foreground leading-snug">
              {submissionTimestamp}
            </p>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Question-by-Question Review</h3>
          <span className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-extrabold">
            {hasQuestions ? `${questions.length} Questions` : "Unavailable"}
          </span>
        </div>

        {hasQuestions ? (
          <>
            <div className="space-y-4">
              {paginatedQuestions.map((q, idx) => (
                <QuestionReview
                  key={q.id}
                  question={q}
                  index={startIndex + idx}
                  studentAnswer={
                    (attempt.answers?.[q.id] as string | string[] | undefined) ?? undefined
                  }
                  showCorrectAnswer={true}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border pt-4 mt-6">
                <div className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="font-bold text-foreground">
                    {startIndex + 1}
                  </span>{" "}
                  -{" "}
                  <span className="font-bold text-foreground">
                    {Math.min(endIndex, questions.length)}
                  </span>{" "}
                  of{" "}
                  <span className="font-bold text-foreground">
                    {questions.length}
                  </span>{" "}
                  questions
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 h-9 px-3 text-xs font-semibold"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Previous
                  </Button>

                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    
                    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                    let end = Math.min(totalPages, start + maxVisible - 1);
                    
                    if (end - start < maxVisible - 1) {
                      start = Math.max(1, end - maxVisible + 1);
                    }

                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <Button
                          key={i}
                          onClick={() => setCurrentPage(i)}
                          variant={i === currentPage ? "default" : "ghost"}
                          size="sm"
                          className={`h-9 w-9 p-0 text-xs font-bold ${
                            i === currentPage 
                              ? "bg-brand text-brand-foreground hover:bg-brand/90" 
                              : "hover:bg-accent"
                          }`}
                        >
                          {i}
                        </Button>
                      );
                    }

                    return pages;
                  })()}

                  <Button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 h-9 px-3 text-xs font-semibold"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={FileText}
            title="Original questions are no longer available"
            description={`The questions for "${examTitle}" have been removed from the database, but the student's score summary (${attempt.score} / ${attempt.totalMarks} • ${attempt.percentage}%) is shown above.`}
            actionLabel={isAdminRoute ? "Back to Admin Results" : "Back to Results"}
            onAction={() => router.push(backHref)}
          />
        )}
      </div>
    </div>
  );
}
