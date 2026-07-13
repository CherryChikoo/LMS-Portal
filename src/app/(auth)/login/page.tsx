"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight, Eye, EyeOff, Sparkles, Check, AlertCircle } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { studentLogin, studentGoogleLogin, formatAuthError } from "@/lib/services/auth-service";
import { setAuthSession } from "@/lib/utils/auth-session";
import type { Student } from "@/types";

function LoginContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restrictedModalOpen, setRestrictedModalOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "restricted") {
      setRestrictedModalOpen(true);
    }
  }, [searchParams]);

  // Auto-dismiss red error warning after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const res = await studentGoogleLogin();
      const target = res.role === "student" ? "/student" : "/admin";
      window.location.assign(target);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("RESTRICTED_ACCOUNT") || msg.toLowerCase().includes("restricted")) {
        setRestrictedModalOpen(true);
      } else {
        setError(formatAuthError(err, "Failed to sign in with Google."));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await studentLogin(email, password);
      const profile = res.profile as Partial<Student>;
      const uObj = {
        id: res.user.uid,
        name: res.profile?.displayName || res.user.displayName || email.split("@")[0] || "Student",
        email: profile?.email || res.user.email || email,
        role: "student",
        department: profile?.department || "Computer Science & Engineering",
        collegeId: profile?.collegeId,
        collegeName: profile?.collegeName || "Global Institute",
        academicYear: profile?.academicYear,
        section: profile?.section,
        batchIds: profile?.batchIds,
      };
      await setAuthSession(uObj, "student");

      window.location.assign("/student");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("RESTRICTED_ACCOUNT") || msg.toLowerCase().includes("restricted")) {
        setRestrictedModalOpen(true);
      } else {
        setError(formatAuthError(err, "Invalid student credentials."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="double-bezel-outer w-full p-2 sm:p-3"
      >
        <div className="double-bezel-inner grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[auto] lg:min-h-[640px]">
          {/* Right Form - first on mobile, right on desktop */}
          <div className="order-1 lg:order-2 lg:col-span-6 p-5 sm:p-8 lg:p-14 flex flex-col justify-between bg-card/40 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{APP_NAME}</span>
              </Link>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Student SSO Portal</span>
            </div>

            <div className="my-auto py-6 sm:py-8 w-full max-w-sm sm:max-w-md mx-auto space-y-5 sm:space-y-6">
              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Student Login</h2>
                <p className="text-sm text-muted-foreground">Enter your college email and password</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] sm:text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                    College Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-10 sm:h-11 min-h-[44px] px-3 sm:px-4 rounded-xl border border-border bg-card/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/50"
                    placeholder="student@college.edu"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] sm:text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full h-10 sm:h-11 min-h-[44px] pl-3 sm:pl-4 pr-11 rounded-xl border border-border bg-card/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/50"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                      rememberMe
                        ? "bg-brand border-brand text-white"
                        : "border-border/60 bg-transparent"
                    }`}
                  >
                    {rememberMe && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                  <span
                    onClick={() => setRememberMe(!rememberMe)}
                    className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
                  >
                    Remember session
                  </span>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-10 sm:h-11 min-h-[44px] rounded-md bg-brand text-white font-medium hover:bg-brand/90 transition-all flex items-center justify-center gap-2 group text-sm sm:text-base"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Authenticating...
                      </span>
                    ) : (
                      <>
                        <span>Sign In to Classroom</span>
                        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground font-semibold">Or continue with</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleLogin}
                  disabled={loading || googleLoading}
                  className="w-full h-10 sm:h-11 min-h-[44px] rounded-xl border border-border bg-card hover:bg-muted font-semibold text-foreground flex items-center justify-center gap-2 sm:gap-3 transition-all shadow-sm text-xs sm:text-sm"
                >
                  {googleLoading ? (
                    <span className="flex items-center gap-2 text-xs">
                      <svg className="animate-spin h-4 w-4 text-foreground" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Connecting Google...
                    </span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Sign In with Google</span>
                    </>
                  )}
                </Button>
              </form>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Don&apos;t have a student account yet?{" "}
              <Link href="/register" className="font-semibold text-emerald-400 hover:underline">
                Create Student Account
              </Link>
            </div>
          </div>

          {/* Left Canvas - second on mobile, left on desktop */}
          <div className="order-2 lg:order-1 lg:col-span-6 relative p-4 sm:p-6 lg:p-12 flex flex-col justify-between overflow-hidden bg-[#05080F] text-white min-h-[120px] sm:min-h-[160px] lg:min-h-[640px]">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-24 -left-24 w-96 h-96 bg-gradient-to-br from-emerald-500/40 via-teal-500/20 to-transparent rounded-full blur-3xl animate-pulse" />
              <div className="absolute top-1/3 -right-20 w-80 h-80 bg-gradient-to-tr from-emerald-600/30 via-cyan-500/20 to-transparent rounded-full blur-2xl" />
              <div className="absolute -bottom-20 left-10 w-96 h-96 bg-gradient-to-t from-[#10B981]/30 via-emerald-950/40 to-transparent rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex items-center gap-3">
              <span className="text-[10px] uppercase font-semibold tracking-[0.25em] text-emerald-400">
                STUDENT LEARNING PORTAL
              </span>
              <div className="hidden sm:block h-px w-12 bg-gradient-to-r from-emerald-500/50 to-transparent" />
            </div>

            <div className="relative z-10 my-auto py-4 sm:py-6 lg:py-12 space-y-2 sm:space-y-4 lg:space-y-6 max-w-md">
              <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.07] border border-white/10 backdrop-blur-md text-[10px] sm:text-xs font-medium text-emerald-300">
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
                <span>One Student Account Per Email</span>
              </div>
              <h1 className="text-xl sm:text-3xl lg:text-5xl font-bold tracking-tight leading-[1.1] font-sans text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-slate-300">
                Welcome to Your Classroom
              </h1>
              <p className="hidden sm:block text-xs sm:text-sm lg:text-base text-slate-300/80 leading-relaxed font-light">
                Access your assigned study resources, interactive markdown examinations, and real-time performance analytics.
              </p>
            </div>

            <div className="relative z-10 pt-4 lg:pt-6 border-t border-white/10 hidden sm:flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-300">Verified College Access Only</span>
              <span className="font-mono text-[11px] text-emerald-400/80">v1.0 Secure</span>
            </div>
          </div>
        </div>
      </motion.div>

      <ConfirmModal
        isOpen={restrictedModalOpen}
        onClose={() => setRestrictedModalOpen(false)}
        onConfirm={() => setRestrictedModalOpen(false)}
        title="Access Restricted"
        message={"Your LMS account has been temporarily restricted by your Trainer/Admin.\n\nPlease contact your Trainer for further assistance."}
        confirmText="Understood"
        variant="warning"
      />
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginContent />
    </Suspense>
  );
}
