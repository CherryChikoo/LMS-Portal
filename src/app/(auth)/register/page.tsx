"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { GraduationCap, ArrowRight, Eye, EyeOff, Sparkles, CheckCircle2, AlertCircle, Building2, Mail, Lock, User, Check, X, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { studentRegister, unifiedGoogleLogin, formatAuthError } from "@/lib/services/auth-service";
import { checkEmailExistsAction } from "@/lib/actions/auth-actions";
import { setAuthSession } from "@/lib/utils/auth-session";
import { useBranding } from "@/providers/branding-provider";

export default function RegisterPage() {
  const { branding } = useBranding();
  const router = useRouter();
  const [step, setStep] = useState<"auth" | "details">("auth");
  const [registeredUid, setRegisteredUid] = useState<string>("");

  // Step 1 Credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step1Checking, setStep1Checking] = useState(false);

  // Step 2 Academic Details
  const [fullName, setFullName] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [department, setDepartment] = useState("Computer Science & Engineering");
  const [section, setSection] = useState("A");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  // Touched validation feedback
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Auto-dismiss red error warning after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Validation Check Rules
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passValid = password.length >= 6;
  const matchValid = password.length > 0 && password === confirmPassword;

  const nameValid = fullName.trim().length >= 2 && /^[a-zA-Z\s\-.']+$/.test(fullName.trim());
  const collegeValid = collegeName.trim().length >= 3;
  const deptValid = department.trim().length >= 2;
  const sectionValid = section.trim().length >= 1;

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await unifiedGoogleLogin("register");
    } catch (err: unknown) {
      setError(formatAuthError(err));
      setGoogleLoading(false);
    }
  };

  // STEP 1: Local Client-Side Validation + Server Email Existence Verification
  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true, confirm: true });

    if (!emailValid) {
      setError("Please enter a valid academic email address.");
      return;
    }
    if (!passValid) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (!matchValid) {
      setError("Passwords do not match. Please check and try again.");
      return;
    }

    setStep1Checking(true);
    setError(null);

    try {
      const emailExists = await checkEmailExistsAction(email.trim());
      if (emailExists) {
        setError("An account with this email address already exists. Please sign in instead.");
        setStep1Checking(false);
        return;
      }
      setStep("details");
    } catch (err: any) {
      console.error("Email pre-check error:", err);
      setStep("details");
    } finally {
      setStep1Checking(false);
    }
  };

  // CANCEL / RESET: User can return to Step 1 at any time without creating an account
  const handleCancelRegistration = () => {
    setError(null);
    setStep("auth");
  };

  // STEP 2: Atomic Creation — Supabase Auth + Database Account Created ONLY after completing all details
  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, college: true, department: true, section: true });

    if (!nameValid) {
      setError("Please enter a valid Full Name (at least 2 characters).");
      return;
    }
    if (!collegeValid) {
      setError("Please enter your full College Name (at least 3 characters).");
      return;
    }
    if (!deptValid) {
      setError("Please specify your Department.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await studentRegister(
        fullName.trim(),
        email.trim(),
        password,
        collegeName.trim(),
        department.trim(),
        section.trim() || "A"
      );

      const uid = res.uid || res.user?.id;
      const actualCollegeId = res.collegeId || collegeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");

      const uObj = {
        id: uid,
        authId: uid,
        name: fullName.trim(),
        email: email.trim() || "",
        role: "student",
        department: department.trim(),
        collegeName: collegeName.trim(),
        collegeId: actualCollegeId,
        section: section.trim() || "A",
        academicYear: "1st Year",
        createdAt: Date.now()
      };
      
      // Establish full authenticated session cookies and local storage immediately
      await setAuthSession(uObj, "student");
      
      // Launch directly into student dashboard
      window.location.assign("/student");
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="double-bezel-outer p-2 sm:p-3"
    >
      <div className="double-bezel-inner grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[660px]">
        
        {/* Left Side: Brand Visual Panel */}
        <div className="lg:col-span-5 bg-card/60 p-8 sm:p-12 flex flex-col justify-between relative border-b lg:border-b-0 lg:border-r border-border overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-brand/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-heading">
                Student Registration
              </h1>
            </div>

            <div className="mt-12 space-y-3">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-heading leading-tight">
                Join your campus <br />
                <span className="text-brand">learning ecosystem.</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Create your student account to access real-time evaluations, department study resources, and automated academic progress tracking.
              </p>
            </div>
          </div>

          {/* Registration Progress Indicator */}
          <div className="relative z-10 mt-8 pt-6 border-t border-border/50">
            <div className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === "auth" ? "bg-brand text-brand-foreground" : "bg-emerald-500 text-white"
              }`}>
                {step === "details" || registered ? <Check className="w-3.5 h-3.5" /> : "1"}
              </div>
              <div className="flex-1 h-1 bg-border/60 rounded-full overflow-hidden">
                <div className={`h-full bg-brand transition-all duration-500 ${
                  step === "details" || registered ? "w-full" : "w-1/2"
                }`} />
              </div>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === "details" ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
              }`}>
                2
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground mt-2 font-medium">
              <span>Account Credentials</span>
              <span>Academic Details</span>
            </div>
          </div>
        </div>

        {/* Right Side: Step-by-Step Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center relative bg-background/40">
          {registered ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8 space-y-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground font-heading">Registration Successful!</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Welcome to {branding.companyName || APP_NAME}! Your student profile has been created and verified.
                </p>
              </div>
              <div className="pt-4">
                <Button
                  onClick={() => window.location.assign("/student")}
                  className="h-11 px-8 rounded-xl bg-brand text-brand-foreground font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/20"
                >
                  <span>Launch Student Dashboard</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          ) : step === "auth" ? (
            <motion.div
              key="step-auth"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6 max-w-md mx-auto w-full"
            >
              <div>
                <h3 className="text-xl font-bold text-foreground font-heading">Step 1: Set Credentials</h3>
                <p className="text-xs text-muted-foreground mt-1">Enter your email and choose a strong password</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmitAuth} className="space-y-4">
                {/* Email Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Academic / College Email</span>
                    </span>
                    {touched.email && !emailValid && (
                      <span className="text-[10px] text-destructive font-medium">Invalid email format</span>
                    )}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onBlur={() => handleBlur("email")}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@college.edu"
                    className={`w-full h-11 px-3.5 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.email && !emailValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Password</span>
                    </span>
                    {touched.password && !passValid && (
                      <span className="text-[10px] text-destructive font-medium">Min 6 characters</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onBlur={() => handleBlur("password")}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full h-11 pl-3.5 pr-10 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                        touched.password && !passValid
                          ? "border-destructive ring-1 ring-destructive/40"
                          : "border-border focus:ring-2 focus:ring-brand/40"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Confirm Password</span>
                    </span>
                    {touched.confirm && !matchValid && (
                      <span className="text-[10px] text-destructive font-medium">Passwords do not match</span>
                    )}
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onBlur={() => handleBlur("confirm")}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full h-11 px-3.5 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.confirm && !matchValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={step1Checking}
                    className="w-full h-11 rounded-xl bg-brand text-brand-foreground font-semibold hover:bg-brand/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20 cursor-pointer disabled:opacity-60"
                  >
                    {step1Checking ? (
                      <>
                        <div className="w-4 h-4 border-2 border-brand-foreground/30 border-t-brand-foreground rounded-full animate-spin" />
                        <span>Verifying Email...</span>
                      </>
                    ) : (
                      <>
                        <span>Continue to Academic Details</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-semibold">
                  <span className="bg-background px-3 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* Google SSO Button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full h-11 rounded-xl border border-border bg-card hover:bg-accent font-semibold text-foreground flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                {googleLoading ? (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg className="animate-spin h-4 w-4 text-foreground" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Connecting Google...
                  </span>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Sign up with Google</span>
                  </>
                )}
              </Button>

              <div className="text-center pt-2">
                <span className="text-xs text-muted-foreground">Already have an account? </span>
                <Link href="/login" className="text-xs font-semibold text-brand hover:underline">
                  Sign in here
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step-details"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6 max-w-md mx-auto w-full"
            >
              <div>
                <h3 className="text-xl font-bold text-foreground font-heading">Step 2: Academic Profile</h3>
                <p className="text-xs text-muted-foreground mt-1">Please provide your institutional enrollment details</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmitDetails} className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Full Name</span>
                    </span>
                    {touched.name && !nameValid && (
                      <span className="text-[10px] text-destructive font-medium">Must be 2+ characters</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onBlur={() => handleBlur("name")}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className={`w-full h-11 px-3.5 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.name && !nameValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* College Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>College / Institution Name</span>
                    </span>
                    {touched.college && !collegeValid && (
                      <span className="text-[10px] text-destructive font-medium">Min 3 characters</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={collegeName}
                    onBlur={() => handleBlur("college")}
                    onChange={(e) => setCollegeName(e.target.value)}
                    placeholder="e.g. Stanford University"
                    className={`w-full h-11 px-3.5 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.college && !collegeValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* Department */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Department</span>
                    </span>
                    {touched.department && !deptValid && (
                      <span className="text-[10px] text-destructive font-medium">Required</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={department}
                    onBlur={() => handleBlur("department")}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Computer Science & Engineering"
                    className={`w-full h-11 px-3.5 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.department && !deptValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* Section / Batch */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Section / Class</span>
                    </span>
                    {touched.section && !sectionValid && (
                      <span className="text-[10px] text-destructive font-medium">Required</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={section}
                    onBlur={() => handleBlur("section")}
                    onChange={(e) => setSection(e.target.value)}
                    placeholder="e.g. A"
                    className={`w-full h-11 px-3.5 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.section && !sectionValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelRegistration}
                    disabled={loading}
                    className="h-11 rounded-xl border border-border hover:bg-muted text-xs font-semibold px-4 cursor-pointer"
                  >
                    Back to Step 1
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-11 rounded-xl bg-brand text-brand-foreground font-semibold hover:bg-brand/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20 cursor-pointer"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating Account...
                      </span>
                    ) : (
                      <>
                        <span>Complete Registration</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
