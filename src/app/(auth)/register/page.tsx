"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { GraduationCap, ArrowRight, Eye, EyeOff, Sparkles, CheckCircle2, AlertCircle, Building2, Mail, Lock, User, Check, X } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { studentRegister, studentGoogleSignUp, completeStudentAcademicDetails, formatAuthError } from "@/lib/services/auth-service";
import { useBranding } from "@/providers/branding-provider";

export default function RegisterPage() {
  const { branding } = useBranding();
  const router = useRouter();
  const [step, setStep] = useState<"auth" | "details">("auth");
  const [registeredUid, setRegisteredUid] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 academic details
  const [fullName, setFullName] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [department, setDepartment] = useState("Computer Science & Engineering");
  const [section, setSection] = useState("A");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  // Auto-dismiss red error warning after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Touched state for real-time visual validation feedback
  const [touched, setTouched] = useState<Record<string, boolean>>({});

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
      const res = await studentGoogleSignUp();
      setRegisteredUid(res.user.uid);
      if (res.user.displayName && res.user.displayName !== "Student") {
        setFullName(res.user.displayName);
      }
      if (res.user.email) setEmail(res.user.email);
      setStep("details");
    } catch (err: unknown) {
      setError(formatAuthError(err, "Failed to sign up with Google."));
    } finally {
      setGoogleLoading(false);
    }
  };

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

    setLoading(true);
    setError(null);
    try {
      const res = await studentRegister("Student Account", email.trim(), password, "Pending College");
      setRegisteredUid(res.user.uid);
      setStep("details");
    } catch (err: unknown) {
      setError(formatAuthError(err, "Failed to create student account."));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, college: true, department: true, section: true });

    if (!nameValid) {
      setError("Please enter a valid Full Name (at least 2 alphabetic characters).");
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
      const { resolvedCollegeId, resolvedCollegeName } = await completeStudentAcademicDetails(registeredUid, {
        fullName: fullName.trim(),
        collegeName: collegeName.trim(),
        department: department.trim(),
        section: section.trim(),
      });
      const uObj = {
        id: registeredUid,
        name: fullName.trim(),
        email: email.trim(),
        role: "student",
        department: department.trim(),
        collegeName: resolvedCollegeName,
        collegeId: resolvedCollegeId,
        section: section.trim() || "A"
      };
      localStorage.setItem("lms_role", "student");
      localStorage.setItem("lms_user", JSON.stringify(uObj));
      localStorage.setItem("user", JSON.stringify(uObj));
      window.dispatchEvent(new Event("storage"));
      setRegistered(true);
    } catch (err: unknown) {
      setError(formatAuthError(err, "Failed to save academic details."));
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
        {/* Left Canvas */}
        <div className="lg:col-span-6 relative p-8 sm:p-12 flex flex-col justify-between overflow-hidden bg-zinc-950 text-white">
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand/30 rounded-full blur-3xl" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-2xl" />
            <div className="absolute -bottom-20 left-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <span className="text-[10px] uppercase font-semibold tracking-[0.25em] text-brand-foreground/80 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              STUDENT REGISTRATION
            </span>
            <div className="h-px w-12 bg-gradient-to-r from-brand/50 to-transparent" />
          </div>

          <div className="relative z-10 my-auto py-8 space-y-5 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-medium text-white/90">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-foreground" />
              <span>Secure Student Enrollment</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.1] font-sans text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60">
              Create Your Academic Account
            </h1>
            <p className="text-sm text-white/60 leading-relaxed font-light">
              Join your college workspace to access lecture resources, complete online assessments, and participate in academic Q&A discussions.
            </p>
          </div>

          <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
            <span className="font-medium text-white/70">Verified Identity Engine</span>
            <span className="font-mono text-[11px] text-brand-foreground/70">Secure Enrollment</span>
          </div>
        </div>

        {/* Right Canvas: Registration Form */}
        <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-center bg-card/80 relative overflow-y-auto max-h-[90vh] lg:max-h-none">
          {registered ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Account Created Successfully!</h2>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  We have sent a mandatory verification link to <strong className="text-foreground">{email}</strong>. Please verify your email before accessing your classroom.
                </p>
              </div>
              <div className="pt-4">
                <Link href="/login">
                  <Button className="w-full bg-brand text-brand-foreground hover:bg-brand/90 h-11">
                    Return to Student Sign In
                  </Button>
                </Link>
              </div>
            </motion.div>
          ) : step === "auth" ? (
            <div className="max-w-sm w-full mx-auto space-y-5">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Student Sign Up</h2>
                <p className="text-xs text-muted-foreground">Enter your college email and password to start.</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmitAuth} className="space-y-3.5">
                {/* College Email ID */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>College Email ID</span>
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
                    className={`w-full h-10 px-3 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.email && !emailValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Create Password</span>
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onBlur={() => handleBlur("password")}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password (any 6+ chars)"
                      className={`w-full h-10 pl-3 pr-10 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                        touched.password && !passValid
                          ? "border-amber-500/70"
                          : "border-border focus:ring-2 focus:ring-brand/40"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Interactive Password Strength Indicator */}
                  {password.length > 0 && (
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/40 border border-border mt-1 text-[11px]">
                      <div className={`flex items-center gap-1 font-semibold ${passValid ? "text-emerald-500" : "text-amber-500"}`}>
                        {passValid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5 text-amber-500" />}
                        <span>{passValid ? "Valid password (6+ chars)" : "At least 6 characters required"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Confirm Password</span>
                    </span>
                    {touched.confirm && !matchValid && confirmPassword.length > 0 && (
                      <span className="text-[10px] text-destructive font-medium">Passwords don&apos;t match</span>
                    )}
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onBlur={() => handleBlur("confirm")}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className={`w-full h-10 px-3 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.confirm && !matchValid && confirmPassword.length > 0
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-brand text-brand-foreground font-semibold hover:bg-brand/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
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
                        <span>Continue to Academic Setup</span>
                        <ArrowRight className="w-4 h-4" />
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
                  className="w-full h-11 rounded-xl border border-border bg-card hover:bg-muted font-semibold text-foreground flex items-center justify-center gap-3 transition-all shadow-sm"
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
                      <span>Sign Up with Google</span>
                    </>
                  )}
                </Button>
              </form>

              <div className="text-center text-xs text-muted-foreground pt-1">
                Already have a student account?{" "}
                <Link href="/login" className="font-semibold text-brand hover:underline">
                  Sign In Here
                </Link>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-sm w-full mx-auto space-y-5"
            >
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[11px] font-semibold mb-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Step 2 of 2: Academic Setup</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Academic Profile</h2>
                <p className="text-xs text-muted-foreground">Please complete your academic details to enroll in classroom modules.</p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmitDetails} className="space-y-3.5">
                {/* Full Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Full Name</span>
                    </span>
                    {touched.name && !nameValid && (
                      <span className="text-[10px] text-destructive font-medium">Must be 2+ alphabetic chars</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onBlur={() => handleBlur("name")}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className={`w-full h-10 px-3 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.name && !nameValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* College Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>College Name</span>
                    </span>
                    {touched.college && !collegeValid && (
                      <span className="text-[10px] text-destructive font-medium">Minimum 3 characters</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={collegeName}
                    onBlur={() => handleBlur("college")}
                    onChange={(e) => setCollegeName(e.target.value)}
                    placeholder="e.g. Stanford Institute of Technology"
                    className={`w-full h-10 px-3 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.college && !collegeValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* Department */}
                <div className="space-y-1">
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
                    className={`w-full h-10 px-3 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.department && !deptValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                {/* Section */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Section / Batch</span>
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
                    className={`w-full h-10 px-3 rounded-xl border bg-background/80 text-sm text-foreground focus:outline-none transition-all ${
                      touched.section && !sectionValid
                        ? "border-destructive ring-1 ring-destructive/40"
                        : "border-border focus:ring-2 focus:ring-brand/40"
                    }`}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-brand text-brand-foreground font-semibold hover:bg-brand/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving Details...
                      </span>
                    ) : (
                      <>
                        <span>Complete Enrollment</span>
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
