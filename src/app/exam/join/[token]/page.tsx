"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "motion/react";
import { Loader2, AlertCircle, CheckCircle2, Clock, Lock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getExamByShareTokenAction, checkExamEligibilityAction } from "@/lib/actions/exam-share-actions";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { supabase } from "@/lib/supabase/client";

export default function ExamJoinPage() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<any>(null);
  const [eligibilityStatus, setEligibilityStatus] = useState<{
    eligible: boolean;
    reason?: string;
  } | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid exam link");
      setLoading(false);
      return;
    }

    validateAndRedirect();
  }, [token]);

  const validateAndRedirect = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Validate token and get exam
      const examResult = await getExamByShareTokenAction(token);
      
      if (!examResult.success || !examResult.exam) {
        setError(examResult.error || "Invalid or expired exam link");
        setLoading(false);
        return;
      }

      setExam(examResult.exam);

      // Step 2: Check authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Not logged in - redirect to login with return URL
        const returnUrl = `/exam/join/${token}`;
        router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
        return;
      }

      // Step 3: Get current user profile
      const user = await getCurrentUser();
      
      if (!user) {
        setError("Unable to verify your account. Please try logging in again.");
        setLoading(false);
        return;
      }

      setCurrentUser(user);

      // Step 4: Check eligibility (server-side validation)
      const userId = user.uid || user.id;
      const eligibilityResult = await checkExamEligibilityAction(examResult.exam.id, userId);

      if (!eligibilityResult.success) {
        setError(eligibilityResult.error || "Unable to verify exam eligibility");
        setLoading(false);
        return;
      }

      if (!eligibilityResult.eligible) {
        setEligibilityStatus({
          eligible: false,
          reason: eligibilityResult.reason || "You don't have access to this exam"
        });
        setLoading(false);
        return;
      }

      // Step 5: Check existing attempt
      const { getStudentAttemptsForCurrentUser } = await import('@/lib/services');
      const attempts = await getStudentAttemptsForCurrentUser(userId, user.email);
      const existingAttempt = attempts.find((a: any) => a.examId === examResult.exam.id);

      // Step 6: Redirect to appropriate exam page
      if (existingAttempt && existingAttempt.status !== "submitted" && existingAttempt.status !== "graded") {
        // Resume in-progress attempt
        router.push(`/exams/${examResult.exam.id}/take`);
      } else if (existingAttempt && (existingAttempt.status === "submitted" || existingAttempt.status === "graded")) {
        // Already completed - go to results
        router.push(`/results/${existingAttempt.id}`);
      } else {
        // Start new attempt - go to exam details/start page
        router.push(`/exams/${examResult.exam.id}`);
      }
    } catch (err: any) {
      console.error("[ExamJoinPage] Error:", err);
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <Loader2 className="w-12 h-12 animate-spin text-brand mx-auto" />
          <p className="text-lg font-medium text-foreground">
            {!currentUser ? "Verifying exam link..." : "Checking eligibility..."}
          </p>
          <p className="text-sm text-muted-foreground">Please wait</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full space-y-6 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Invalid Exam Link
            </h1>
            <p className="text-muted-foreground">{error}</p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => router.push("/login")}
              className="w-full"
            >
              Go to Login
            </Button>
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="w-full"
            >
              Go to Dashboard
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (eligibilityStatus && !eligibilityStatus.eligible) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full space-y-6 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Access Denied
            </h1>
            <p className="text-muted-foreground">{eligibilityStatus.reason}</p>
          </div>

          {exam && (
            <div className="p-4 rounded-lg bg-muted/50 text-left space-y-2">
              <p className="text-sm font-semibold text-foreground">{exam.title}</p>
              {exam.colleges?.name && (
                <p className="text-xs text-muted-foreground">
                  College: {exam.colleges.name}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={() => router.push("/exams")}
              className="w-full"
            >
              View My Exams
            </Button>
            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="w-full"
            >
              Go to Dashboard
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Fallback (shouldn't reach here due to redirects)
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-12 h-12 animate-spin text-brand" />
    </div>
  );
}
