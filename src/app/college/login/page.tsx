"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight, Eye, EyeOff, ShieldCheck, Check, AlertCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { collegeAdminLogin, formatAuthError } from "@/lib/services/auth-service";
import { setAuthSession } from "@/lib/utils/auth-session";

export default function CollegeLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss warning after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await collegeAdminLogin(cleanEmail, password);
      const actualRole = "college_admin";
      const uObj = {
        id: res.user?.uid || res.profile?.id || `college-admin-${Date.now()}`,
        name: res.profile?.displayName || res.user?.displayName || "College Admin",
        displayName: res.profile?.displayName || res.user?.displayName || "College Admin",
        email: cleanEmail,
        role: actualRole,
        collegeId: (res.profile as any)?.collegeId || ""
      };
      await setAuthSession(uObj, actualRole);
      window.location.assign("/");
    } catch (err: unknown) {
      setError(formatAuthError(err, "Incorrect email or password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="double-bezel-outer w-full p-2 sm:p-3"
    >
      <div className="double-bezel-inner grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[480px] sm:min-h-[560px] lg:min-h-[640px]">
        {/* Left Canvas - Purple / Red Theme */}
        <div className="lg:col-span-6 relative p-5 sm:p-8 lg:p-12 flex flex-col justify-between overflow-hidden bg-zinc-950 text-white min-h-[160px] sm:min-h-[200px]">
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-gradient-to-br from-blue-600/40 via-cyan-500/25 to-transparent rounded-full blur-3xl animate-pulse" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 bg-gradient-to-tr from-sky-600/30 via-indigo-500/20 to-transparent rounded-full blur-2xl" />
            <div className="absolute -bottom-20 left-10 w-96 h-96 bg-gradient-to-t from-cyan-600/30 via-blue-950/40 to-transparent rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <span className="text-[10px] uppercase font-semibold tracking-[0.25em] text-cyan-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              PARTNER INSTITUTION COMMAND CENTER
            </span>
            <div className="h-px w-12 bg-gradient-to-r from-blue-500/50 via-cyan-500/50 to-transparent" />
          </div>

          <div className="relative z-10 my-auto py-6 sm:py-10 lg:py-12 space-y-4 sm:space-y-6 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.07] border border-white/10 backdrop-blur-md text-[10px] sm:text-xs font-medium text-blue-300">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400" />
              <span>Partner Access Portal</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] font-sans text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-slate-300">
              Manage Your Institution
            </h1>
            <p className="text-xs sm:text-sm lg:text-base text-slate-300/80 leading-relaxed font-light">
              Full control over colleges, bulk student provisioning, dynamic Markdown examinations, hierarchical resource distribution, and live assessments.
            </p>
          </div>

          <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-300">Authorized College Admins Only</span>
            <span className="font-mono text-[11px] text-cyan-400/80">Secure Route</span>
          </div>
        </div>

        {/* Right Form */}
        <div className="lg:col-span-6 p-5 sm:p-8 lg:p-14 flex flex-col justify-between bg-card/40 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-gradient-to-r from-blue-600 to-cyan-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-md">
                <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="font-bold text-base sm:text-lg text-foreground tracking-tight">{APP_NAME} Platform</span>
            </Link>
            <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Partner Portal</span>
          </div>

          <div className="my-auto py-6 sm:py-8 w-full max-w-sm sm:max-w-md mx-auto space-y-5 sm:space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">College Login</h2>
              <p className="text-sm text-muted-foreground">Sign in with your authorized college admin credentials</p>
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
                  College Admin Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-10 sm:h-11 min-h-[44px] px-3 sm:px-4 rounded-xl border border-border bg-card/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Enter college admin email"
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
                    className="w-full h-10 sm:h-11 min-h-[44px] pl-3 sm:pl-4 pr-11 rounded-xl border border-border bg-card/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                      ? "bg-gradient-to-r from-blue-600 to-cyan-600 border-blue-600 text-white"
                      : "border-border/60 bg-transparent"
                  }`}
                >
                  {rememberMe && <Check className="w-3 h-3 stroke-[3]" />}
                </button>
                <span
                  onClick={() => setRememberMe(!rememberMe)}
                  className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
                >
                  Remember college session
                </span>
              </div>

              <div className="pt-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 sm:h-11 min-h-[44px] rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium transition-all shadow-md flex items-center justify-center gap-2 group text-sm sm:text-base"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verifying Access...
                    </span>
                  ) : (
                    <>
                      <span>Sign In to College Dashboard</span>
                      <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </>
                  )}
                </Button>
              </div>

            </form>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            Strictly monitored portal. Unauthorized login attempts are logged.
          </div>
        </div>
      </div>
    </motion.div>
  );
}
