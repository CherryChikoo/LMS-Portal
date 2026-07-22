"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight, Eye, EyeOff, Sparkles, Check, AlertCircle } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { unifiedLogin, unifiedGoogleLogin, formatAuthError } from "@/lib/services/auth-service";
import { setAuthSession } from "@/lib/utils/auth-session";
import type { Student } from "@/types";
import { useBranding } from "@/providers/branding-provider";

function LoginContent() {
  const { branding } = useBranding();
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
      const res = await unifiedGoogleLogin();
      const target = res.role === "student" ? "/student" : (res.role === "college_admin" ? "/colleges" : "/admin");
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
      const res = await unifiedLogin(email, password);
      
      const uObj = {
        id: res.user.uid,
        name: res.profile?.displayName || res.user.displayName || email.split("@")[0] || "User",
        email: res.profile?.email || res.user.email || email,
        role: res.role,
        department: res.profile?.department || "General",
        collegeId: res.profile?.collegeId || "",
        collegeName: res.profile?.collegeName || "",
        academicYear: res.profile?.academicYear,
        section: res.profile?.section,
        batchIds: res.profile?.batchIds,
      };
      
      await setAuthSession(uObj, res.role as "admin" | "trainer" | "college_admin" | "student");

      if (res.role === "student") {
        window.location.assign("/student");
      } else if (res.role === "college_admin") {
        window.location.assign("/colleges");
      } else {
        window.location.assign("/admin");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("RESTRICTED_ACCOUNT") || msg.toLowerCase().includes("restricted")) {
        setRestrictedModalOpen(true);
      } else {
        setError(formatAuthError(err, "Invalid credentials."));
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
        <div className="double-bezel-inner grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[auto] lg:min-h-[580px]">
          {/* Right Form - first on mobile, right on desktop */}
          <div className="order-1 lg:order-2 lg:col-span-6 p-5 sm:p-8 lg:p-10 flex flex-col bg-card/40 backdrop-blur-xl">

            <div className="flex-1 flex flex-col justify-center w-full max-w-sm sm:max-w-md mx-auto space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Sign In</h2>
                <p className="text-sm text-muted-foreground">Log in to your account</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] sm:text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-9 sm:h-10 min-h-[36px] px-3 sm:px-4 rounded-xl border border-white/10 dark:border-white/10 bg-card/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/50"
                    placeholder="you@example.com"
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
                      className="w-full h-9 sm:h-10 min-h-[36px] pl-3 sm:pl-4 pr-11 rounded-xl border border-white/10 dark:border-white/10 bg-card/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/50"
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

                <div className="pt-1">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-9 sm:h-10 min-h-[36px] rounded-xl bg-brand text-brand-foreground font-medium hover:bg-brand/90 transition-all flex items-center justify-center gap-2 group text-sm sm:text-base"
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
                        <span>Sign In</span>
                        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
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
                  className="w-full h-9 sm:h-10 min-h-[36px] rounded-xl border border-white/10 dark:border-white/10 bg-card hover:bg-muted font-semibold text-foreground flex items-center justify-center gap-2 sm:gap-3 transition-all shadow-sm text-xs sm:text-sm"
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
                    <div className="text-center text-xs text-muted-foreground pt-3 mt-2 border-t border-border/50">
                Don't have an account?{" "}
                <Link href="/register" className="text-brand font-semibold hover:underline">
                  Create Account
                </Link>
              </div>
            </div>

            <div className="pt-4 mt-auto border-t border-border/50 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-3">
              <span>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</span>
              <div className="flex items-center gap-4">
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              </div>
            </div>
          </div>

          {/* Left Canvas (Decorative visual) - second on mobile, left on desktop */}
          <div className="hidden lg:flex order-2 lg:order-1 lg:col-span-6 relative p-5 sm:p-8 lg:p-12 flex-col justify-between overflow-hidden bg-zinc-950 text-white min-h-[160px] sm:min-h-[200px]">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand/30 rounded-full blur-3xl" />
              <div className="absolute top-1/3 -right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-20 left-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex items-center gap-3">
              <span className="text-[10px] uppercase font-semibold tracking-[0.25em] text-brand-foreground/80 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                CENTRALIZED ACCESS
              </span>
              <div className="h-px w-12 bg-gradient-to-r from-brand/50 to-transparent" />
            </div>

            <div className="relative z-10 my-auto py-6 sm:py-10 lg:py-12 space-y-4 sm:space-y-6 max-w-md">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md text-[10px] sm:text-xs font-medium text-white/90">
                <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-brand-foreground" />
                <span>Unified Login Portal</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] font-sans text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60">
                Welcome to {APP_NAME}
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-white/60 leading-relaxed font-light">
                Sign in to access your assessments, manage your institution, or oversee administrative operations.
              </p>
            </div>

            <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
              <span className="font-medium text-white/70">Secure Authentication</span>
              <span className="font-mono text-[11px] text-brand-foreground/70">Role-Based Access</span>
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
