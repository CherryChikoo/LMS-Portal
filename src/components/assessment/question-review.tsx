import { Check, HelpCircle, X, BrainCircuit, Target, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Question } from "@/types";

export interface QuestionReviewProps {
  question: Question;
  index: number;
  studentAnswer?: string | string[];
  showCorrectAnswer: boolean;
}

const DIFFICULTY_STYLES: Record<
  Question["difficulty"],
  { label: string; className: string }
> = {
  easy: {
    label: "Easy",
    className:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  medium: {
    label: "Medium",
    className:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  hard: {
    label: "Hard",
    className:
      "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  },
};

function normalizeAnswer(answer: string | string[] | undefined): string[] {
  if (answer === undefined || answer === null) return [];
  return Array.isArray(answer) ? answer : [answer];
}

function getCorrectAnswerSet(question: Question): Set<string> {
  return new Set(normalizeAnswer(question.correctAnswer));
}

function getStudentAnswerSet(answer: string | string[] | undefined): Set<string> {
  return new Set(normalizeAnswer(answer));
}

export function QuestionReview({
  question,
  index,
  studentAnswer,
  showCorrectAnswer,
}: QuestionReviewProps) {
  const correctSet = getCorrectAnswerSet(question);
  const studentSet = getStudentAnswerSet(studentAnswer);
  const difficultyStyle = DIFFICULTY_STYLES[question.difficulty];
  const isChoiceQuestion =
    question.type === "mcq" || question.type === "true-false";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-foreground shadow-sm sm:p-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Badge
          variant="outline"
          className="border-brand/30 bg-brand/15 text-brand font-bold"
        >
          Question {index + 1}
        </Badge>

        <Badge
          variant="outline"
          className={cn("font-semibold", difficultyStyle.className)}
        >
          {difficultyStyle.label}
        </Badge>

        <Badge
          variant="outline"
          className="border-border bg-muted text-muted-foreground font-semibold"
        >
          {question.marks ?? 1} {question.marks === 1 ? "Mark" : "Marks"}
        </Badge>

        <Badge
          variant="outline"
          className="border-border bg-background text-muted-foreground font-medium capitalize"
        >
          {question.type.replace("-", " ")}
        </Badge>
      </div>

      {/* Question text */}
      <p className="text-base font-semibold leading-relaxed text-foreground">
        {question.text}
      </p>

      {/* Options / Inputs */}
      {isChoiceQuestion ? (
        <div className="flex flex-col gap-2.5 pt-1">
          {(question.options ?? []).map((option, optIdx) => {
            const letter = String.fromCharCode(65 + optIdx);
            const isStudentSelected = studentSet.has(option);
            const isCorrectOption = correctSet.has(option);
            const isWrongSelection =
              isStudentSelected && !isCorrectOption && showCorrectAnswer;

            const baseClasses =
              "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors";

            const stateClasses = isWrongSelection
              ? "border-rose-500/40 bg-rose-500/10 text-foreground ring-1 ring-rose-500/40"
              : isCorrectOption && showCorrectAnswer
                ? "border-emerald-500/40 bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/40"
                : isStudentSelected
                  ? "border-brand/40 bg-brand/10 text-foreground ring-1 ring-brand/40"
                  : "border-border bg-background text-foreground";

            return (
              <div
                key={`${question.id}-${optIdx}`}
                className={cn(baseClasses, stateClasses)}
                aria-current={isStudentSelected ? "true" : undefined}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    isWrongSelection
                      ? "border-rose-500 bg-rose-500 text-white"
                      : isCorrectOption && showCorrectAnswer
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : isStudentSelected
                          ? "border-brand bg-brand text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {letter}
                </span>
                <span className="flex-1">{option}</span>
                {showCorrectAnswer && isCorrectOption && (
                  <Check
                    className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-label="Correct answer"
                  />
                )}
                {isWrongSelection && (
                  <X
                    className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400"
                    aria-label="Incorrect selection"
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-1">
          <label
            htmlFor={`qa-${question.id}`}
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Your answer
          </label>
          <input
            id={`qa-${question.id}`}
            type="text"
            disabled
            value={
              Array.isArray(studentAnswer)
                ? studentAnswer.join(", ")
                : studentAnswer ?? ""
            }
            placeholder="No answer submitted"
            className="h-11 w-full rounded-xl border border-border bg-muted/40 px-4 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-100"
          />

          {showCorrectAnswer && correctSet.size > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Correct answer
              </span>
              <span className="text-sm font-semibold text-foreground">
                {[...correctSet].join(" / ")}
              </span>
            </div>
          )}
        </div>
      )}
      {/* AI Explanation Pending State */}
      {showCorrectAnswer && !question.aiExplanation && question.aiExplanationStatus === "pending" && (
        <div className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-4 flex flex-col items-center justify-center gap-2 text-brand">
          <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span className="text-sm font-semibold">AI Explanation is currently being generated...</span>
        </div>
      )}


      {/* Legacy Explanation (Fallback) */}
      {showCorrectAnswer && !question.aiExplanation && question.explanation && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <HelpCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-brand"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Explanation
            </span>
            <p className="text-sm leading-relaxed text-foreground">
              {question.explanation}
            </p>
          </div>
        </div>
      )}

      {/* AI Explanation (Gemini) */}
      {showCorrectAnswer && question.aiExplanation && (
        <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="bg-brand/5 border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-brand">
                AI Learning Explanation
              </span>
            </div>
            {question.aiExplanation.overview?.difficulty && (
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-muted-foreground">
                {question.aiExplanation.overview.difficulty}
              </Badge>
            )}
          </div>
          
          <div className="p-4 space-y-5">
            {/* Concept Breakdown */}
            <div className="space-y-2.5">
              <h4 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5" /> Concept Breakdown
              </h4>
              <div className="p-3.5 bg-muted/30 rounded-xl space-y-2 border border-border/50">
                <p className="text-sm font-medium text-foreground">
                  {question.aiExplanation.overview?.summary}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {question.aiExplanation.stepByStep}
                </p>
              </div>
            </div>

            {/* Answer Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <h4 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Answer Analysis
                </h4>
                <div className="p-3.5 bg-emerald-500/5 rounded-xl border border-emerald-500/20 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Why it's correct</p>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {question.aiExplanation.whyCorrect}
                  </p>
                </div>
              </div>

              {studentAnswer && !getStudentAnswerSet(studentAnswer).has(String(question.correctAnswer)) && typeof studentAnswer === "string" && question.aiExplanation.whyIncorrect?.[studentAnswer] && (
                <div className="space-y-2.5">
                  <h4 className="text-[11px] font-bold uppercase text-transparent select-none tracking-wider flex items-center gap-1.5">
                    _
                  </h4>
                  <div className="p-3.5 bg-destructive/5 rounded-xl border border-destructive/20 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-destructive">Why your answer was wrong</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      {question.aiExplanation.whyIncorrect[studentAnswer]}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Tags & Concepts */}
            {question.aiExplanation.keyConcepts && question.aiExplanation.keyConcepts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50">
                {question.aiExplanation.keyConcepts.map((c: string) => (
                  <Badge key={c} variant="outline" className="text-[10px] bg-background border-border text-muted-foreground">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
