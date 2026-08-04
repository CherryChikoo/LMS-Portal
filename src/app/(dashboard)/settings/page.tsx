"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Save,
  UserPlus,
  ShieldCheck,
  Building2,
  Mail,
  Phone,
  Briefcase,
  Sliders,
  Users,
  RefreshCw,
  Sparkles,
  Key,
  Trash2,
  GraduationCap,
  Bell,
  BookOpen,
  Clock,
  Camera,
  Shield
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { GlassCard } from "@/components/shared/glass-card";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer, staggerItem } from "@/lib/animations";
import { auth, db } from "@/lib/firebase/config";
import {
  updateProfile,
  updatePassword as firebaseUpdatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  getIdToken,
} from "firebase/auth";
import { setDoc, doc, getDoc, onSnapshot, getDocuments, where, deleteDocument, serverTimestamp } from "@/lib/firebase/firestore";
import { deleteField } from "firebase/firestore";
import { subscribeToCompanyBranding, updateCompanyBranding, type CompanyBranding } from "@/lib/services/branding-service";
import { getCollegeById, updateCollege } from "@/lib/services/college-service";
import { formatAuthError } from "@/lib/services/auth-service";

function StudentAccountSettings() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [college, setCollege] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const isSavingProfileRef = useRef(false);

  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const pwdSuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasPasswordProvider, setHasPasswordProvider] = useState(() => {
    return auth.currentUser?.providerData.some((p) => p.providerId === "password") ?? true;
  });

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setHasPasswordProvider(user.providerData.some((p) => p.providerId === "password"));
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const u = JSON.parse(uStr);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loading saved profile from localStorage on mount
        if (u.name) setName(u.name);
        if (u.email) setEmail(u.email);
        if (u.department || u.branch) setDepartment(u.department || u.branch);
        if (u.rollNumber || u.rollNo) setRollNumber(u.rollNumber || u.rollNo);
        if (u.college || u.collegeName) setCollege(u.college || u.collegeName);
        if (u.phone) setPhone(u.phone);

        if (u.email) {
          setOriginalEmail(u.email.toLowerCase().trim());
        }

        if (u.id) {
          unsub = onSnapshot(doc(db, "students", u.id), (snap) => {
            if (snap.exists()) {
              const d = snap.data();

              // While the user is actively saving the profile, ignore Firestore snapshot
              // updates for the email field to prevent a brief flash of the old email.
              if (!isSavingProfileRef.current) {
                if (d.name) setName(d.name);
                if (d.email) {
                  setEmail(d.email);
                  setOriginalEmail(d.email.toLowerCase().trim());
                }
                if (d.department) setDepartment(d.department);
                if (d.rollNumber) setRollNumber(d.rollNumber);
                if (d.collegeName) setCollege(d.collegeName);
                if (d.phone) setPhone(d.phone);

                const newU = { ...u, ...d, name: d.name || u.name, college: d.collegeName || u.college };
                localStorage.setItem("lms_user", JSON.stringify(newU));
                localStorage.setItem("user", JSON.stringify(newU));
                window.dispatchEvent(new Event("storage"));
              }
            }
          });
        }
      }
    } catch { /* ignore */ }
    return () => { if (unsub) unsub(); };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    isSavingProfileRef.current = true;
    setUpdating(true);
    setProfileError(null);
    setSaved(false);

    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user") || "{}";
      const u = JSON.parse(uStr);
      const cleanEmail = email.toLowerCase().trim();
      const oldEmail = originalEmail || (u.email || "").toLowerCase().trim();
      const emailChanged = oldEmail !== "" && cleanEmail !== oldEmail;
      const primaryId = u.id || (auth.currentUser ? auth.currentUser.uid : "");

      if (!primaryId) {
        throw new Error("Unable to identify your account. Please sign in again.");
      }

      // 1. Update non-email profile fields first (always allowed)
      const baseUpdateData = {
        name,
        displayName: name,
        department,
        rollNumber,
        collegeName: college,
        phone,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "students", primaryId), baseUpdateData, { merge: true });
      await setDoc(doc(db, "users", primaryId), baseUpdateData, { merge: true });

      // 2. Update Firebase Auth display name when name changes
      if (auth.currentUser && name !== u.name) {
        try {
          await updateProfile(auth.currentUser, { displayName: name });
           
        } catch (profileErr: unknown) {
          console.warn("Could not update Firebase Auth display name:", profileErr);
        }
      }

      // 2b. Sync updated name into all past exam results so transcripts reflect current details
      if (name !== u.name && primaryId) {
        try {
          const results = await getDocuments("exam_results", [where("studentId", "==", primaryId)]);
          await Promise.all(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            results.data.map((r: any) =>
              setDoc(doc(db, "exam_results", r.id), { studentName: name, updatedAt: new Date() }, { merge: true })
            )
          );
           
        } catch (syncErr: unknown) {
          console.warn("Could not sync name to past results:", syncErr);
        }
      }

      // 3. Handle login email change separately (requires password reauthentication)
      if (emailChanged) {
        // Uniqueness checks in Firestore (primary source of truth for this app).
        // Note: Google/social accounts that exist in Firebase Auth but have no Firestore
        // record cannot be detected client-side without a mail service or Admin SDK.
        const existingStudents = await getDocuments("students", [where("email", "==", cleanEmail)]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (existingStudents.data.some((sDoc: any) => sDoc.id !== primaryId)) {
          throw new Error("This email address is already registered to another student.");
        }

        const existingUsers = await getDocuments("users", [where("email", "==", cleanEmail)]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (existingUsers.data.some((uDoc: any) => uDoc.id !== primaryId)) {
          throw new Error("This email address is already registered to another account.");
        }

        if (!auth.currentUser) {
          // Demo / fallback user without a live Firebase Auth session: update Firestore only.
          await setDoc(doc(db, "students", primaryId), { email: cleanEmail }, { merge: true });
          await setDoc(doc(db, "users", primaryId), { email: cleanEmail }, { merge: true });

          // Delete old duplicate records that still reference the previous email
          const oldStudents = await getDocuments("students", [where("email", "==", oldEmail)]);
          for (const sDoc of oldStudents.data) {
            if (sDoc.id !== primaryId) {
              await deleteDocument("students", sDoc.id);
            }
          }
          const oldUsers = await getDocuments("users", [where("email", "==", oldEmail)]);
          for (const uDoc of oldUsers.data) {
            if (uDoc.id !== primaryId) {
              await deleteDocument("users", uDoc.id);
            }
          }

          const updated = { ...u, name, email: cleanEmail, department, rollNumber, college, phone };
          localStorage.setItem("lms_user", JSON.stringify(updated));
          localStorage.setItem("user", JSON.stringify(updated));
          window.dispatchEvent(new Event("storage"));
          setOriginalEmail(cleanEmail);
        } else {
          const isPasswordProvider = auth.currentUser.providerData.some((p) => p.providerId === "password");
          const isGoogleProvider = auth.currentUser.providerData.some((p) => p.providerId === "google.com");

          if (isGoogleProvider) {
            throw new Error("Email cannot be changed for Google sign-in accounts from this page. Please update your Google account email instead.");
          }

          if (!isPasswordProvider) {
            throw new Error("Only email/password accounts can change their login email here.");
          }

          if (!currentPasswordForEmail) {
            throw new Error("Current password is required to update your login email.");
          }

          // Verify identity with current password before changing the email.
          const credential = EmailAuthProvider.credential(
            auth.currentUser.email || oldEmail,
            currentPasswordForEmail
          );
          await reauthenticateWithCredential(auth.currentUser, credential);

          // Get a fresh ID token and update the login email via the secure Admin SDK endpoint.
          const idToken = await getIdToken(auth.currentUser, true);
          const response = await fetch("/api/update-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, newEmail: cleanEmail }),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || "Failed to update login email.");
          }

          // Update Firestore records safely with merge.
          await setDoc(doc(db, "students", primaryId), { email: cleanEmail }, { merge: true });
          await setDoc(doc(db, "users", primaryId), { email: cleanEmail }, { merge: true });

          const updated = { ...u, name, email: cleanEmail, department, rollNumber, college, phone };
          localStorage.setItem("lms_user", JSON.stringify(updated));
          localStorage.setItem("user", JSON.stringify(updated));
          window.dispatchEvent(new Event("storage"));
          setOriginalEmail(cleanEmail);
        }
      } else {
        // No email change - sync localStorage with current values
        const updated = { ...u, name, email: oldEmail, department, rollNumber, college, phone };
        localStorage.setItem("lms_user", JSON.stringify(updated));
        localStorage.setItem("user", JSON.stringify(updated));
        window.dispatchEvent(new Event("storage"));
      }

      setCurrentPasswordForEmail("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const message = formatAuthError(err, "Failed to update profile.");
      setProfileError(message);
    } finally {
      isSavingProfileRef.current = false;
      setUpdating(false);
    }
  };

  const handleUpdatePwd = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear any pending success state/timeout from a previous attempt
    if (pwdSuccessTimeoutRef.current) {
      clearTimeout(pwdSuccessTimeoutRef.current);
      pwdSuccessTimeoutRef.current = null;
    }
    setPwdSuccess(false);
    setPwdError(null);

    if (hasPasswordProvider && !curPwd) {
      setPwdError("Please enter your current password.");
      return;
    }

    if (!newPwd) {
      setPwdError("Please enter a new password.");
      return;
    }

    if (newPwd.length < 6) {
      setPwdError("New password must be at least 6 characters long.");
      return;
    }

    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user") || "{}";
      const u = JSON.parse(uStr);
      const primaryId = u.id || (auth.currentUser ? auth.currentUser.uid : "");

      if (!auth.currentUser || !primaryId) {
        throw new Error("Unable to verify your session. Please sign in again.");
      }

      if (hasPasswordProvider) {
        // Verify current password before allowing any change
        const credential = EmailAuthProvider.credential(
          auth.currentUser.email || (u.email || ""),
          curPwd
        );
        await reauthenticateWithCredential(auth.currentUser, credential);
      }

      // Update Firebase Authentication password (single source of truth)
      await firebaseUpdatePassword(auth.currentUser, newPwd);
      setHasPasswordProvider(true);

      // Remove the fallback initialPassword from Firestore so only the Auth password remains valid.
      // Delete any duplicate/old records that still reference this student.
      const pwdUpdateData = {
        initialPassword: deleteField(),
        mustChangePassword: false,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "students", primaryId), pwdUpdateData, { merge: true });
      await setDoc(doc(db, "users", primaryId), pwdUpdateData, { merge: true });

      const targetEmail = (u.email || email).toLowerCase().trim();
      if (targetEmail) {
        const matchingStudents = await getDocuments("students", [where("email", "==", targetEmail)]);
        for (const sDoc of matchingStudents.data) {
          if (sDoc.id !== primaryId) {
            await deleteDocument("students", sDoc.id);
          }
        }
        const matchingUsers = await getDocuments("users", [where("email", "==", targetEmail)]);
        for (const uDoc of matchingUsers.data) {
          if (uDoc.id !== primaryId) {
            await deleteDocument("users", uDoc.id);
          }
        }
      }

      // Do not store plaintext passwords in localStorage
      delete u.password;
      delete u.initialPassword;
      localStorage.setItem("lms_user", JSON.stringify(u));
      localStorage.setItem("user", JSON.stringify(u));
      window.dispatchEvent(new Event("storage"));

      setPwdSuccess(true);
      setCurPwd("");
      setNewPwd("");
      pwdSuccessTimeoutRef.current = setTimeout(() => setPwdSuccess(false), 3000);
       
    } catch (err: unknown) {
      const code = (err as any)?.code || "";
      const msg = (err as any)?.message || "";

      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPwdError("Current password is incorrect.");
      } else if (code === "auth/requires-recent-login") {
        setPwdError("Your session has expired. Please sign out and sign in again before changing your password.");
      } else if (code === "auth/weak-password") {
        setPwdError("New password is too weak. Please choose a stronger password.");
      } else {
        setPwdError(msg || "Failed to update password.");
      }

      // Ensure success banner is never shown alongside an error
      setPwdSuccess(false);
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6 max-w-5xl mx-auto pb-12 font-sans">
      <PageHeader
        title="Student Account & Credentials Center"
        description="Manage your enrolled department profile, email address, and login security credentials all in one place."
      />

      <GlassCard className="p-6 sm:p-8 space-y-6 border-brand/20 shadow-xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand font-extrabold text-lg">
              {name ? name.charAt(0).toUpperCase() : "S"}
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Academic Profile & Contact Details</h3>
              <p className="text-xs text-muted-foreground">{department} • Roll No: {rollNumber}</p>
            </div>
          </div>
          {saved && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-500 text-xs font-bold animate-pulse">
              <CheckCircle2 className="w-4 h-4" /> Profile Updated!
            </div>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="h-11 rounded-xl bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-brand uppercase flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Email Address (Login Email)
              </Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="h-11 rounded-xl bg-background border-brand/40 font-medium" />
              {originalEmail && email.toLowerCase().trim() !== originalEmail && (
                <p className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Changing your login email requires your current password below.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Roll Number / Student ID</Label>
              <Input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} className="h-11 rounded-xl bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Department / Specialization</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} className="h-11 rounded-xl bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Institution / College</Label>
              <Input value={college} onChange={(e) => setCollege(e.target.value)} className="h-11 rounded-xl bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Phone / WhatsApp</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl bg-background" />
            </div>
          </div>

          {originalEmail && email.toLowerCase().trim() !== originalEmail && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <Label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Current Password Required
              </Label>
              <Input
                type="password"
                value={currentPasswordForEmail}
                onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                placeholder="Enter your current password to authorize email change"
                className="h-11 rounded-xl bg-background border-amber-500/40"
              />
              <p className="text-[11px] text-muted-foreground">
                For security, Firebase requires your current password before changing your login email.
              </p>
            </div>
          )}

          {profileError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button type="submit" disabled={updating} className="h-11 px-6 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold flex items-center gap-2 shadow-lg shadow-brand/20">
              <Save className="w-4 h-4" />
              <span>{updating ? "Saving..." : "Save Profile & Email"}</span>
            </Button>
          </div>
        </form>
      </GlassCard>

      <GlassCard className="p-6 sm:p-8 space-y-6 border-emerald-500/20 shadow-xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500" /> Account Security & Login Credentials
            </h3>
            <p className="text-xs text-muted-foreground">Update your login password used for exam portal access and student authentication.</p>
          </div>
          {pwdSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-500 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" /> Password Changed Successfully!
            </div>
          )}
        </div>

        <form onSubmit={handleUpdatePwd} className="space-y-4 max-w-md">
          {pwdError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pwdError}</span>
            </div>
          )}
          {hasPasswordProvider ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Current Password</Label>
              <Input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} required placeholder="••••••••" className="h-11 rounded-xl bg-background" />
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-bold flex items-center gap-2">
              <Key className="w-4 h-4 shrink-0 text-blue-400" />
              <span>Your account is linked to Google Sign-In (no password set). Set a password below to enable Email/Password login alongside Google!</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-emerald-500 uppercase flex items-center gap-1">
              <Key className="w-3.5 h-3.5" /> New Login Password
            </Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required placeholder="••••••••" className="h-11 rounded-xl bg-background border-emerald-500/40" />
          </div>
          <div className="pt-2">
            <Button type="submit" className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 shadow-md shadow-emerald-500/20">
              <Lock className="w-4 h-4" />
              <span>{hasPasswordProvider ? "Update Password" : "Set Login Password"}</span>
            </Button>
          </div>
        </form>
      </GlassCard>
    </motion.div>
  );
}

export default function SettingsPage() {
  const [userRole, setUserRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const role = localStorage.getItem("lms_role");
      if (role) setUserRole(role.toLowerCase());
    } catch {}
  }, []);
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "branding">("profile");
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);

  // Profile fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Security & Password fields
  const [loginEmail, setLoginEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [hasPasswordProvider, setHasPasswordProvider] = useState(() => {
    return auth.currentUser?.providerData.some((p) => p.providerId === "password") ?? true;
  });

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setHasPasswordProvider(user.providerData.some((p) => p.providerId === "password"));
      }
    });
    return () => unsubAuth();
  }, []);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdSaved, setPwdSaved] = useState(false);
  const [pwdError, setPwdError] = useState("");

  const isMasterAccount = (
    email?.toLowerCase() === "trainer@gmail.com" ||
    loginEmail?.toLowerCase() === "trainer@gmail.com" ||
    auth.currentUser?.email?.toLowerCase() === "trainer@gmail.com"
  );

  // Branding fields
  const [branding, setBranding] = useState<CompanyBranding>({ companyName: "LMS Portal", companySubtitle: "Enterprise v2.4" });
  const [brandName, setBrandName] = useState("");
  const [brandSubtitle, setBrandSubtitle] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandSaved, setBrandSaved] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    const initBranding = async () => {
      let role = "admin";
      try {
        role = (localStorage.getItem("lms_role") || "admin").toLowerCase();
      } catch {}
      
      if (role === "college_admin") {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const u = uStr ? JSON.parse(uStr) : null;
        const cId = u?.collegeId;
        if (cId) {
          const college = await getCollegeById(cId);
          if (college && college.branding) {
            setBranding({
              companyName: college.branding.companyName || college.name,
              companySubtitle: college.branding.companySubtitle || "College Portal",
              logoBase64: college.branding.logoBase64 || "",
            });
            setBrandName(college.branding.companyName || college.name);
            setBrandSubtitle(college.branding.companySubtitle || "College Portal");
            setBrandLogo(college.branding.logoBase64 || "");
          }
        }
      } else {
        unsub = subscribeToCompanyBranding((data) => {
          setBranding(data);
          setBrandName(data.companyName || "LMS Portal");
          setBrandSubtitle(data.companySubtitle || "Enterprise v2.4");
          setBrandLogo(data.logoBase64 || "");
        });
      }
    };
    initBranding();
    return () => unsub();
  }, []);

  const handleSaveBranding = async () => {
    setSavingBrand(true);
    setBrandSaved(false);
    try {
      if (userRole === "college_admin") {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const u = uStr ? JSON.parse(uStr) : null;
        const cId = u?.collegeId;
        if (cId) {
          const cBrand = {
            companyName: brandName.trim(),
            companySubtitle: brandSubtitle.trim() || "College Portal",
            logoBase64: brandLogo,
            updatedAt: serverTimestamp(),
          };
          const colRef = doc(db, "colleges", cId);
          await setDoc(colRef, {
            branding: cBrand,
          }, { merge: true });
          localStorage.setItem("lms_college_branding", JSON.stringify({ collegeId: cId, branding: cBrand }));
          window.dispatchEvent(new Event("storage"));
        }
      } else {
        await updateCompanyBranding({
          companyName: brandName.trim(),
          companySubtitle: brandSubtitle.trim(),
          logoBase64: brandLogo,
        });
      }
      setBrandSaved(true);
      setTimeout(() => setBrandSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save branding:", err);
    } finally {
      setSavingBrand(false);
    }
  };

  const handleBrandLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 300;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/png");
        setBrandLogo(base64);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    let currentRole = "admin";
    try {
      const r = localStorage.getItem("lms_role") || "admin";
      currentRole = r.toLowerCase();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loading saved role from localStorage on mount
      setUserRole(currentRole);
    } catch { /* ignore */ }

    // Load active user profile strictly from storage
    const savedUserStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
    let loadedName = "";
    let loadedEmail = "";
    let loadedDesignation = "";
    let loadedDept = "";
    let loadedPhone = "";

    if (savedUserStr) {
      try {
        const u = JSON.parse(savedUserStr);
        loadedName = u.name || u.displayName || loadedName;
        loadedEmail = u.email || loadedEmail;
        if (u.designation) loadedDesignation = u.designation;
        if (u.department) loadedDept = u.department;
        if (u.phone) loadedPhone = u.phone;
      } catch { }
    }

    setDisplayName(loadedName);
    setEmail(loadedEmail);
    setLoginEmail(loadedEmail);
    setDesignation(loadedDesignation);
    setDepartment(loadedDept);
    setPhone(loadedPhone);
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    setProfileError("");

    if (!displayName.trim() || displayName.trim().length < 2) {
      setProfileError("Display name must be at least 2 characters long.");
      setSavingProfile(false);
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          await updateProfile(currentUser, { displayName: displayName.trim() });
        } catch { }
        try {
          await setDoc(
            doc(db, "users", currentUser.uid),
            {
              displayName: displayName.trim(),
              designation: designation.trim(),
              department: department.trim(),
              phone: phone.trim(),
              updatedAt: new Date()
            },
            { merge: true }
          );
        } catch { }
      }

      // Persist in localStorage so topbar and other UI reflect immediately
      const savedUserStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const u = savedUserStr ? JSON.parse(savedUserStr) : { id: "admin-1", role: "trainer" };
      u.name = displayName.trim();
      u.displayName = displayName.trim();
      u.email = email.trim();
      u.designation = designation.trim();
      u.department = department.trim();
      u.phone = phone.trim();

      localStorage.setItem("lms_user", JSON.stringify(u));
      localStorage.setItem("user", JSON.stringify(u));

      // Trigger global event for Topbar and Sidebar
      window.dispatchEvent(new Event("storage"));

      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 4000);
    } catch (err: unknown) {
      setProfileError(formatAuthError(err, "Failed to save profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeSecurity = async () => {
    setSavingPwd(true);
    setPwdSaved(false);
    setPwdError("");

    if (hasPasswordProvider && !currentPassword) {
      setPwdError("Please enter your current password to authorize changes.");
      setSavingPwd(false);
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setPwdError("New password must be at least 6 characters long.");
      setSavingPwd(false);
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setPwdError("New password and confirmation do not match.");
      setSavingPwd(false);
      return;
    }

    try {
      const targetEmail = email.toLowerCase().trim();
      const newEmail = loginEmail.trim().toLowerCase();
      const emailChanged = newEmail && newEmail !== targetEmail;

      if (!auth.currentUser) {
        throw new Error("Unable to verify your session. Please sign in again.");
      }

      if (hasPasswordProvider) {
        // Verify current password via Firebase Auth reauthentication
        const credential = EmailAuthProvider.credential(auth.currentUser.email || targetEmail, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }

      // Update password if provided
      if (newPassword) {
        await firebaseUpdatePassword(auth.currentUser, newPassword);
        setHasPasswordProvider(true);

        // Clear initialPassword and mustChangePassword flags from Firestore so
        // only the Firebase Auth password remains the valid credential.
        const pwdCleanup: Record<string, any> = {
          initialPassword: deleteField(),
          mustChangePassword: deleteField(),
          updatedAt: new Date()
        };
        await setDoc(doc(db, "users", auth.currentUser.uid), pwdCleanup, { merge: true });

        // If college admin, also update colleges document with new password for admin overview sync
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const u = uStr ? JSON.parse(uStr) : null;
        if (u?.collegeId) {
          await setDoc(doc(db, "colleges", u.collegeId), { initialPassword: newPassword, updatedAt: new Date() }, { merge: true });
        }
      }

      // Update login email if changed (server-side via Admin SDK)
      if (emailChanged) {
        const idToken = await getIdToken(auth.currentUser, true);
        const response = await fetch("/api/update-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, newEmail }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Failed to update login email.");
        }
        setEmail(newEmail);


      }

      // Sync updated details to Firestore and localStorage
      const uid = auth.currentUser.uid;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: Record<string, any> = {
        displayName: displayName,
        department: department,
        phone: phone,
        updatedAt: new Date()
      };
      if (emailChanged) updatePayload.email = newEmail;
      await setDoc(doc(db, "users", uid), updatePayload, { merge: true });

      // If a students doc exists with the same uid, sync the email there too
      if (emailChanged) {
        const studentRef = doc(db, "students", uid);
        const studentSnap = await getDoc(studentRef);
        if (studentSnap.exists()) {
          await setDoc(doc(db, "students", uid), { email: newEmail }, { merge: true });
        }
      }

      const savedUserStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (savedUserStr) {
        const u = JSON.parse(savedUserStr);
        u.name = displayName;
        u.displayName = displayName;
        u.department = department;
        u.phone = phone;
        if (emailChanged) u.email = newEmail;
        localStorage.setItem("lms_user", JSON.stringify(u));
        localStorage.setItem("user", JSON.stringify(u));
      }

      window.dispatchEvent(new Event("storage"));

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setLoginEmail(emailChanged ? newEmail : targetEmail);
      setPwdSaved(true);
      setTimeout(() => setPwdSaved(false), 5000);
    } catch (err: unknown) {
      setPwdError(formatAuthError(err, "Failed to update security credentials."));
    } finally {
      setSavingPwd(false);
    }
  };

  if (userRole === "student") {
    return <StudentAccountSettings />;
  }

  if (!mounted) return null;

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6 sm:space-y-8 font-sans pb-12">
      {/* Top Page Header */}
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> {userRole === "trainer" ? "Trainer Portal" : "Admin Portal Center"}
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground font-heading tracking-tight">
            System Settings & Account Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5">
            Configure administrative credentials and profile designations.
          </p>
        </div>
      </motion.div>

      {/* Tabs Navigation */}
      <motion.div variants={staggerItem}>
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-card/80 dark:bg-white/[0.03] border border-border/60 backdrop-blur-md">
          {[
            { id: "profile", label: "Profile & Identity", icon: User },
            { id: "security", label: "Security & Passwords", icon: Key },
            { id: "branding", label: "Company Branding & Logo", icon: Building2 }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  isActive
                    ? "bg-brand text-white shadow-md shadow-brand/20 scale-[1.01]"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Tab 1: Profile & Identity */}
      <AnimatePresence mode="wait">
        {activeTab === "profile" && (
          <motion.div
            key="profile-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            <div className="lg:col-span-8 space-y-6">
              <GlassCard className="p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border/40">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">Personnel Identity Specification</h3>
                      <p className="text-xs text-muted-foreground">Changes here immediately reflect across student evaluation sheets and headers.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="displayName" className="text-xs font-bold text-foreground">Full Display Name</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Vikram Malhotra"
                      className="glass-input h-11 rounded-xl font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="designation" className="text-xs font-bold text-foreground">Official Designation / Title</Label>
                    <Input
                      id="designation"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Chief Assessment Officer"
                      className="glass-input h-11 rounded-xl font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="department" className="text-xs font-bold text-foreground">Primary Department / Division</Label>
                    <Input
                      id="department"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Academic Operations"
                      className="glass-input h-11 rounded-xl font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-xs font-bold text-foreground">Direct Contact Number</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="glass-input h-11 rounded-xl font-medium"
                    />
                  </div>
                </div>

                {profileError && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border/40">
                  {profileSaved ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-500 font-extrabold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Profile synchronized successfully!</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Persisted to local session &amp; Firestore</span>
                  )}
                  <Button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="h-11 w-full sm:w-auto px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingProfile ? "Synchronizing..." : "Save Identity Changes"}</span>
                  </Button>
                </div>
              </GlassCard>
            </div>

            {/* Right Profile Live Preview Card */}
            <div className="lg:col-span-4">
              <GlassCard className="p-6 space-y-5 bg-gradient-to-b from-card/90 to-card/50">
                <div className="text-center space-y-3.5 py-3">
                  <Avatar className="w-20 h-20 mx-auto shadow-xl shadow-brand/25 ring-4 ring-brand/15">
                    <AvatarFallback className="text-2xl font-black text-brand-foreground bg-brand">
                      {displayName ? displayName.slice(0, 2).toUpperCase() : "AD"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="text-base font-extrabold text-foreground">{displayName || "System Administrator"}</h4>
                    <p className="text-xs font-semibold text-brand mt-0.5">{designation}</p>
                    <p className="text-[11px] text-muted-foreground">{department}</p>
                  </div>
                </div>

                <Separator className="opacity-50" />

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-brand" /> Login Email
                    </span>
                    <span className="font-mono font-bold text-foreground truncate max-w-[140px]">{email}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-emerald-500" /> Phone
                    </span>
                    <span className="font-semibold text-foreground">{phone || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                      Access Level
                    </span>
                    <Badge variant="outline" className="font-extrabold text-emerald-500 bg-emerald-500/10 border-emerald-500/30">
                      {userRole === "trainer" ? "TRAINER" : "ADMIN"}
                    </Badge>
                  </div>
                </div>
              </GlassCard>
            </div>
          </motion.div>
        )}

        {/* Tab 2: Security & Credentials */}
        {activeTab === "security" && (
          <motion.div
            key="security-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="max-w-3xl space-y-6"
          >
            <GlassCard className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border/40">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Key className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Authentication & Password Center</h3>
                  <p className="text-xs text-muted-foreground">Update your login email address and security password for future sessions.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="loginEmail" className="text-xs font-bold text-foreground">Authorized Login Email</Label>
                  <Input
                    id="loginEmail"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="glass-input h-11 rounded-xl font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">This email will be used when signing in at `/login`.</p>
                </div>

                <Separator className="opacity-40 py-2" />

                {hasPasswordProvider ? (
                  <div className="space-y-2">
                    <Label htmlFor="currPwd" className="text-xs font-bold text-foreground">Current Password (Required for confirmation)</Label>
                    <div className="relative">
                      <Input
                        id="currPwd"
                        type={showCurrentPwd ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="glass-input h-11 rounded-xl pr-10 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-bold flex items-center gap-2">
                    <Key className="w-4 h-4 shrink-0 text-blue-400" />
                    <span>Your account is linked to Google Sign-In (no password set). Set a password below to enable Email/Password login alongside Google!</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="newPwd" className="text-xs font-bold text-foreground">New Security Password</Label>
                    <div className="relative">
                      <Input
                        id="newPwd"
                        type={showNewPwd ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className="glass-input h-11 rounded-xl pr-10 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPwd(!showNewPwd)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confPwd" className="text-xs font-bold text-foreground">Confirm New Password</Label>
                    <Input
                      id="confPwd"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="glass-input h-11 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {pwdError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{pwdError}</span>
                </div>
              )}

              <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border/40">
                {pwdSaved ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-500 font-extrabold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Security credentials updated successfully!</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Authorized for next portal login
                  </p>
                )}
                <Button
                  onClick={handleChangeSecurity}
                  disabled={savingPwd}
                  className="h-11 w-full sm:w-auto px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Update Security Credentials
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Tab 3: Company Branding & Logo */}
        {activeTab === "branding" && (
          <motion.div
            key="branding-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            <div className="lg:col-span-8 space-y-6">
              <GlassCard className="p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-border/40">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-brand" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">{userRole === "college_admin" ? "College Branding" : "Global Company Branding"}</h3>
                      <p className="text-xs text-muted-foreground">{userRole === "college_admin" ? "Configure your college logo and name displayed to your students and admins." : "Configure the portal logo and company name displayed across all admin and student interfaces."}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-foreground">Company Logo (Base64 Image)</Label>
                    <div className="flex items-center gap-5 p-4 rounded-2xl border border-border/80 bg-background/50">
                      {brandLogo ? (
                        <div className="relative w-20 h-20 rounded-xl border border-border bg-card flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                          <img src={brandLogo} alt="Company Logo" className="w-full h-full object-contain p-1" />
                          <button
                            type="button"
                            onClick={() => setBrandLogo("")}
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-1 shadow hover:bg-rose-600"
                            title="Remove Logo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground shrink-0 bg-muted/20">
                          <Building2 className="w-8 h-8 opacity-40" />
                          <span className="text-[10px] mt-1 font-semibold">No Logo</span>
                        </div>
                      )}
                      <div className="flex-1 space-y-1.5">
                        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold cursor-pointer transition-colors shadow-sm">
                          <Camera className="w-4 h-4" />
                          <span>{brandLogo ? "Upload New Logo" : "Upload Logo Image"}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleBrandLogoChange}
                            className="hidden"
                          />
                        </label>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Supported formats: PNG, JPG, WEBP, or SVG. Automatically optimized and stored in base64 format in Firebase for global visibility.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="brandName" className="text-xs font-bold text-foreground">Company / Portal Name</Label>
                    <Input
                      id="brandName"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="e.g. Acme Institute LMS"
                      className="glass-input h-11 rounded-xl"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      This name replaces the default "LMS Portal" text in the sidebar header for all admins, trainers, and students.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="brandSubtitle" className="text-xs font-bold text-foreground">Subtitle / Tagline</Label>
                    <Input
                      id="brandSubtitle"
                      value={brandSubtitle}
                      onChange={(e) => setBrandSubtitle(e.target.value)}
                      placeholder="e.g. Enterprise v2.4"
                      className="glass-input h-11 rounded-xl"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Displayed directly below the company name in the sidebar.
                    </p>
                  </div>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border/40">
                  {brandSaved ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-500 font-extrabold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{userRole === "college_admin" ? "College branding" : "Global branding"} updated successfully!</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Changes take effect immediately across all sessions</span>
                  )}
                  <Button
                    onClick={handleSaveBranding}
                    disabled={savingBrand}
                    className="h-11 w-full sm:w-auto px-6 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground font-bold flex items-center gap-2 shadow-lg shadow-brand/20"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingBrand ? "Saving Branding..." : "Save Global Branding"}</span>
                  </Button>
                </div>
              </GlassCard>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        onClose={() => setConfirmConfig(null)}
        onConfirm={confirmConfig?.onConfirm || (() => { })}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Confirm"
        variant={confirmConfig?.variant || "destructive"}
        isAlert={confirmConfig?.isAlert}
      />
    </motion.div>
  );
}
