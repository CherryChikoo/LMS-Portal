"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, Sparkles, AlertCircle, CheckCircle2, XCircle, BrainCircuit, Target, LineChart, TargetIcon, Flame, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDocument } from "@/lib/firebase/firestore";
import { getExamById } from "@/lib/services";
import { fadeInUp } from "@/lib/animations";
import type { Exam, ExamResult, Question } from "@/types";

export default function AIReviewPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [attempt, setAttempt] = useState<ExamResult | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    async function loadData() {
      try {
        const fetched = await getDocument<ExamResult>("exam_results", attemptId);
        if (fetched) {
          setAttempt(fetched);
          if (fetched.aiSummary) setSummary(fetched.aiSummary);
          
          const ex = await getExamById(fetched.examId);
          if (ex) {
            setExam(ex);
            
            // If any question is still pending, poll every 3 seconds
            const isPending = ex.questions?.some(q => q.aiExplanationStatus === "pending");
            if (isPending) {
              pollInterval = setTimeout(loadData, 3000);
            } else {
              setLoading(false);
            }
            return;
          }
        }
      } catch (err) {
        console.error("Failed to load AI review data:", err);
      }
      setLoading(false);
    }
    loadData();

    return () => clearTimeout(pollInterval);
  }, [attemptId]);

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId: attemptId }),
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingSummary(false);
    }
  };

  if (loading || (exam?.questions?.some(q => q.aiExplanationStatus === "pending"))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-brand">
        <Sparkles className="w-8 h-8 animate-pulse" />
        <span className="text-sm font-medium">Preparing AI Learning Review...</span>
      </div>
    );
  }

  if (!attempt || !exam) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <h2 className="text-xl font-bold mb-4">Assessment Not Found</h2>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="max-w-4xl mx-auto space-y-8 pb-16 font-sans">
      <div className="flex items-center justify-between">
        <Button onClick={() => router.back()} variant="outline" size="sm" className="h-9 px-3 gap-1.5 shadow-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Results
        </Button>
        <Badge className="bg-brand text-brand-foreground shadow-sm">
          <Sparkles className="w-3.5 h-3.5 mr-1" />
          AI Mentorship Mode
        </Badge>
      </div>

      <div className="space-y-2 text-center py-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Personalized AI Review</h1>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          Deep-dive into every question with intelligent explanations, common pitfalls, and personalized learning insights tailored to your performance.
        </p>
      </div>

      <div className="space-y-6">
        {exam.questions?.map((q, idx) => {
          const ai = q.aiExplanation;
          const studentAns = attempt.answers[q.id];
          let isCorrect = false;
          if (Array.isArray(q.correctAnswer) && Array.isArray(studentAns)) {
            isCorrect = q.correctAnswer.length === studentAns.length && q.correctAnswer.every(v => (studentAns as string[]).includes(v));
          } else if (typeof q.correctAnswer === "string" && typeof studentAns === "string") {
            isCorrect = q.correctAnswer === studentAns;
          }

          if (!ai) return (
            <div key={q.id} className="p-6 border border-border rounded-xl bg-card">
              <span className="text-sm font-bold text-muted-foreground">Q{idx + 1}</span>
              <p className="mt-2 text-sm">{q.text}</p>
              <div className="mt-4 p-3 bg-muted rounded-lg text-xs text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> AI Explanation is pending or unavailable for this question.
              </div>
            </div>
          );

          return (
            <motion.div key={q.id} className="border border-border rounded-2xl bg-card overflow-hidden shadow-sm">
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black uppercase text-brand tracking-wider bg-brand/10 px-2 py-0.5 rounded-sm">Question {idx + 1}</span>
                      <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-sm">{ai.overview.difficulty}</span>
                      {isCorrect ? (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-sm flex items-center"><CheckCircle2 className="w-3 h-3 mr-1"/> Correct</span>
                      ) : (
                        <span className="text-xs font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-sm flex items-center"><XCircle className="w-3 h-3 mr-1"/> Incorrect</span>
                      )}
                    </div>
                    <p className="font-medium text-[15px] leading-relaxed">{q.text}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5" /> Concept Breakdown</h4>
                    <div className="p-4 bg-muted/30 rounded-xl space-y-2 border border-border/50">
                      <p className="text-sm font-medium text-foreground">{ai.overview.summary}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{ai.stepByStep}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Answer Analysis</h4>
                    <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20 space-y-2">
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Why it's correct:</p>
                      <p className="text-xs text-foreground/80 leading-relaxed">{ai.whyCorrect}</p>
                    </div>
                    {!isCorrect && ai.whyIncorrect && typeof studentAns === "string" && ai.whyIncorrect[studentAns] && (
                      <div className="p-4 bg-destructive/5 rounded-xl border border-destructive/20 space-y-2">
                        <p className="text-xs font-bold text-destructive">Why your answer was wrong:</p>
                        <p className="text-xs text-foreground/80 leading-relaxed">{ai.whyIncorrect[studentAns]}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4">
                  {ai.keyConcepts.map(c => (
                    <Badge key={c} variant="outline" className="text-[10px] bg-background border-border text-muted-foreground hover:bg-accent">{c}</Badge>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="pt-12 border-t border-border space-y-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-extrabold flex items-center justify-center gap-2">
            <LineChart className="w-6 h-6 text-brand" /> Your Learning Report
          </h2>
          {!summary ? (
            <div className="py-6">
              <Button onClick={handleGenerateSummary} disabled={generatingSummary} size="lg" className="rounded-full shadow-lg h-12 px-8 font-bold text-sm bg-brand hover:bg-brand/90 text-brand-foreground">
                {generatingSummary ? (
                   <><Sparkles className="w-4 h-4 mr-2 animate-spin" /> Analyzing Performance...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Generate Personalized Summary</>
                )}
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">This generates a custom mentorship report based on your specific answers.</p>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-left bg-gradient-to-br from-brand/5 via-card to-background rounded-3xl p-8 border border-border shadow-sm">
              <p className="text-lg font-medium text-foreground leading-relaxed mb-8 text-center max-w-2xl mx-auto">"{summary.overallPerformance}"</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card rounded-2xl p-6 border border-border space-y-4 shadow-sm">
                   <h3 className="text-sm font-bold flex items-center gap-2 text-foreground"><TargetIcon className="w-4 h-4 text-emerald-500" /> Strong Topics</h3>
                   <div className="flex flex-wrap gap-2">
                     {summary.strongTopics?.map((t: string) => <Badge key={t} className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 shadow-none">{t}</Badge>)}
                   </div>
                </div>
                <div className="bg-card rounded-2xl p-6 border border-border space-y-4 shadow-sm">
                   <h3 className="text-sm font-bold flex items-center gap-2 text-foreground"><Flame className="w-4 h-4 text-destructive" /> Needs Focus</h3>
                   <div className="flex flex-wrap gap-2">
                     {summary.weakTopics?.map((t: string) => <Badge key={t} className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 shadow-none">{t}</Badge>)}
                   </div>
                </div>
              </div>

              <div className="mt-6 bg-card rounded-2xl p-6 border border-border shadow-sm">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><BookOpen className="w-4 h-4 text-brand" /> Study Plan & Next Steps</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{summary.personalizedStudyPlan}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {summary.learningRecommendations?.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 bg-muted/40 p-3 rounded-lg border border-border/50">
                      <div className="w-5 h-5 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[10px] font-bold shrink-0">{i+1}</div>
                      <p className="text-[13px] font-medium leading-snug">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <p className="mt-8 text-center text-sm font-medium text-brand">{summary.motivationalSummary}</p>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
