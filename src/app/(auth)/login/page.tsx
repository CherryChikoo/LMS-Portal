"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Eye, EyeOff, AlertCircle, Check } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { unifiedLogin, unifiedGoogleLogin, formatAuthError } from "@/lib/services/auth-service";
import { setAuthSession } from "@/lib/utils/auth-session";
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
      
      const uObj = {
        id: res.user.uid,
        name: res.profile?.displayName || res.user.displayName || res.user.email?.split("@")[0] || "User",
        email: res.profile?.email || res.user.email || "",
        role: res.role,
        department: (res.profile as any)?.department || "General",
        collegeId: (res.profile as any)?.collegeId || "",
        collegeName: (res.profile as any)?.collegeName || "",
        academicYear: (res.profile as any)?.academicYear,
        section: (res.profile as any)?.section,
        batchIds: (res.profile as any)?.batchIds,
      };
      
      await setAuthSession(uObj, res.role as "admin" | "trainer" | "college_admin" | "student");
      
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
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full relative"
      >
        <div className="absolute inset-0 bg-white/5 dark:bg-white/5 rounded-2xl md:rounded-[32px] blur-xl" />
        <div className="relative bg-black/40 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-2xl md:rounded-[32px] overflow-hidden p-5 sm:p-8 flex flex-col items-center">
          
          {/* Logo */}
          {branding.logoBase64 && (
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-brand/10 border border-brand/20 rounded-2xl flex items-center justify-center mb-5 shadow-inner shadow-brand/20">
              <img src={branding.logoBase64} alt="Logo" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
            </div>
          )}

          <div className="text-center space-y-1.5 mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Welcome Back</h2>
            <p className="text-sm text-white/60">Sign in to your account to continue</p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="w-full p-3 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-xs font-medium text-white/70 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-brand/50 transition-all hover:bg-white/10"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] sm:text-xs font-medium text-white/70 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full h-11 pl-4 pr-12 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-brand/50 transition-all hover:bg-white/10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div 
              className="flex items-center gap-2 pt-2 cursor-pointer select-none"
              onClick={() => setRememberMe(!rememberMe)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRememberMe(!rememberMe);
                }}
                className={`w-4 h-4 rounded flex items-center justify-center border transition-all duration-200 cursor-pointer ${
                  rememberMe
                    ? "bg-brand border-brand text-white"
                    : "border-white/20 bg-transparent hover:border-white/40"
                }`}
              >
                {rememberMe && <Check className="w-3 h-3 stroke-[3]" />}
              </button>
              <span className="text-xs font-medium text-white/60 cursor-pointer select-none hover:text-white transition-colors">
                Remember session
              </span>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-brand text-brand-foreground font-semibold hover:bg-brand/90 transition-all flex items-center justify-center gap-2 group text-sm shadow-lg shadow-brand/20 cursor-pointer"
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
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </>
                )}
              </Button>
            </div>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-semibold">
                <span className="bg-[#0a0a0c] px-3 text-white/40">Or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className="w-full h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 font-semibold text-white flex items-center justify-center gap-3 transition-all cursor-pointer"
            >
              {googleLoading ? (
                <span className="flex items-center gap-2 text-sm text-white/70">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </span>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Sign In with Google</span>
                </>
              )}
            </Button>
            <p className="text-[10px] text-center text-white/40 mt-3 font-medium">Google Sign-In is for student accounts only</p>
          </form>
          
          <div className="w-full mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-[11px] text-white/40 gap-3">
            <span className="font-medium">&copy; {new Date().getFullYear()} {APP_NAME}.</span>
            <div className="flex items-center gap-4 font-medium">
              <Link href="/privacy" className="hover:text-white transition-colors cursor-pointer">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors cursor-pointer">Terms</Link>
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
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0c]" />}>
      <LoginContent />
    </Suspense>
  );
}
