import { Check, HelpCircle, X, BrainCircuit, Target, Sparkles, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Question } from "@/types";

export interface QuestionReviewProps {
  question: Question;
  index: number;
  studentAnswer?: string | number | string[];
  showCorrectAnswer: boolean;
}

const DIFFICULTY_STYLES: Record<
  NonNullable<Question["difficulty"]>,
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

function normalizeAnswer(answer: string | number | string[] | undefined): string[] {
  if (answer === undefined || answer === null) return [];
  return Array.isArray(answer) ? answer.map(String) : [String(answer)];
}

function getCorrectAnswerSet(question: Question): Set<string> {
  return new Set(normalizeAnswer(question.correctAnswer));
}

function getStudentAnswerSet(answer: string | number | string[] | undefined): Set<string> {
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
  const difficultyStyle = DIFFICULTY_STYLES[question.difficulty || "medium"];
  const isChoiceQuestion =
    question.type === "mcq" || question.type === "true-false";

  const isUnattempted =
    studentSet.size === 0 ||
    (Array.isArray(studentAnswer)
      ? studentAnswer.length === 0 || studentAnswer.every((a) => !a || !String(a).trim())
      : !studentAnswer || !String(studentAnswer).trim());

  const isCorrect =
    !isUnattempted &&
    [...studentSet].every((ans) => correctSet.has(ans)) &&
    studentSet.size === correctSet.size;

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
          {(question.type || "mcq").replace("-", " ")}
        </Badge>

        {isUnattempted ? (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-extrabold uppercase tracking-wide text-[10px]"
          >
            Unattempted
          </Badge>
        ) : isCorrect ? (
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold uppercase tracking-wide text-[10px]"
          >
            Correct
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400 font-extrabold uppercase tracking-wide text-[10px]"
          >
            Incorrect
          </Badge>
        )}
      </div>

      {/* Question text */}
      <p className="text-base font-semibold leading-relaxed text-foreground">
        {question.text}
      </p>

      {/* Unattempted Callout Banner */}
      {isUnattempted && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>You did not attempt this question.</span>
        </div>
      )}

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
          {(() => {
            const rawAnswer = Array.isArray(studentAnswer)
              ? studentAnswer.join(", ")
              : studentAnswer ?? "";
            const hasAnswer = String(rawAnswer).trim().length > 0;
            const isCorrect = hasAnswer && studentSet.size > 0 && [...studentSet].some(a => correctSet.has(a));
            const isWrong = showCorrectAnswer && hasAnswer && !isCorrect;
            const isBlank = showCorrectAnswer && !hasAnswer;

            const inputClasses = isWrong || isBlank
              ? "h-11 w-full rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 text-sm font-medium text-foreground ring-1 ring-rose-500/40 placeholder:text-rose-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-100"
              : showCorrectAnswer && isCorrect
                ? "h-11 w-full rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 text-sm font-medium text-foreground ring-1 ring-emerald-500/40 placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-100"
                : "h-11 w-full rounded-xl border border-border bg-muted/40 px-4 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-100";

            return (
              <>
                <label
                  htmlFor={`qa-${question.id}`}
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Your answer
                </label>
                <div className="relative">
                  <input
                    id={`qa-${question.id}`}
                    type="text"
                    disabled
                    value={rawAnswer}
                    placeholder="No answer submitted"
                    className={inputClasses}
                  />
                  {(isWrong || isBlank) && (
                    <X className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-rose-500" />
                  )}
                  {showCorrectAnswer && isCorrect && (
                    <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                </div>

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
              </>
            );
          })()}
        </div>
      )}

      {/* Legacy Explanation & Graceful AI Explanation Fallback */}
      {showCorrectAnswer && !question.aiExplanation && (
        <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-4 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-brand animate-pulse shrink-0" />
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              AI Explanation
            </span>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              {question.explanation || "AI Explanation is currently being generated..."}
            </p>
          </div>
        </div>
      )}

      {/* AI Explanation (Gemini) */}
      {showCorrectAnswer && question.aiExplanation && (
        <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="p-4 space-y-5">


            {/* Answer Analysis */}
            {(() => {
              const showWhyIncorrect = studentAnswer && !getStudentAnswerSet(studentAnswer).has(String(question.correctAnswer)) && typeof studentAnswer === "string" && question.aiExplanation?.whyIncorrect?.[studentAnswer];
              return (
                <div className={`grid grid-cols-1 ${showWhyIncorrect ? 'md:grid-cols-2' : ''} gap-5`}>
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                      <Target className="w-4 h-4" /> Answer Analysis
                    </h4>
                    <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 space-y-2.5">
                      <p className="text-xs font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Why it's correct</p>
                      <p className="text-sm text-foreground/90 leading-relaxed font-medium">
                        {question.aiExplanation?.whyCorrect}
                      </p>
                    </div>
                  </div>

                  {showWhyIncorrect && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase text-transparent select-none tracking-widest flex items-center gap-2">
                        _
                      </h4>
                      <div className="p-5 bg-destructive/5 rounded-2xl border border-destructive/20 space-y-2.5">
                        <p className="text-xs font-extrabold uppercase tracking-widest text-destructive">Why your answer was wrong</p>
                        <p className="text-sm text-foreground/90 leading-relaxed font-medium">
                          {question.aiExplanation?.whyIncorrect?.[studentAnswer as string]}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Tags & Concepts */}
            {question.aiExplanation.keyConcepts && question.aiExplanation.keyConcepts.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-border/50">
                {question.aiExplanation.keyConcepts.map((c: string) => (
                  <Badge key={c} variant="outline" className="text-xs px-2.5 py-0.5 bg-background border-border text-muted-foreground font-semibold">
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
