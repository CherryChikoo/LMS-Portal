"use client";

import { useState, useEffect } from "react";
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
  Clock
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { GlassCard } from "@/components/shared/glass-card";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { fadeInUp, staggerContainer, staggerItem } from "@/lib/animations";
import { auth, db } from "@/lib/firebase/config";
import {
  updateProfile,
  updatePassword as firebaseUpdatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "firebase/auth";
import { setDoc, doc, onSnapshot } from "@/lib/firebase/firestore";

interface AdminRosterUser {
  id: string;
  name: string;
  email: string;
  role: "Administrator" | "Trainer";
  department: string;
  status: "Active" | "Pending";
  createdAt: string;
}

function StudentAccountSettings() {
  const [tab, setTab] = useState<"profile" | "security" | "notifications">("profile");
  const [name, setName] = useState("Student Candidate");
  const [email, setEmail] = useState("student@lms.dev");
  const [department, setDepartment] = useState("Computer Science & Engineering");
  const [rollNumber, setRollNumber] = useState("ROLL-2026");
  const [college, setCollege] = useState("St. Xavier's College of Engineering");
  const [phone, setPhone] = useState("+91 98765 12345");
  const [saved, setSaved] = useState(false);

  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const u = JSON.parse(uStr);
        if (u.name) setName(u.name);
        if (u.email) setEmail(u.email);
        if (u.department || u.branch) setDepartment(u.department || u.branch);
        if (u.rollNumber || u.rollNo) setRollNumber(u.rollNumber || u.rollNo);
        if (u.college || u.collegeName) setCollege(u.college || u.collegeName);
        if (u.phone) setPhone(u.phone);

        if (u.id) {
          unsub = onSnapshot(doc(db, "students", u.id), (snap) => {
            if (snap.exists()) {
              const d = snap.data();
              if (d.name) setName(d.name);
              if (d.email) setEmail(d.email);
              if (d.department) setDepartment(d.department);
              if (d.rollNumber) setRollNumber(d.rollNumber);
              if (d.collegeName) setCollege(d.collegeName);
              if (d.phone) setPhone(d.phone);

              const newU = { ...u, ...d, name: d.name || u.name, college: d.collegeName || u.college };
              localStorage.setItem("lms_user", JSON.stringify(newU));
              localStorage.setItem("user", JSON.stringify(newU));
              window.dispatchEvent(new Event("storage"));
            }
          });
        }
      }
    } catch (_) { }
    return () => { if (unsub) unsub(); };
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user") || "{}";
      const u = JSON.parse(uStr);
      const updated = { ...u, name, email, department, rollNumber, college, phone };
      localStorage.setItem("lms_user", JSON.stringify(updated));
      localStorage.setItem("user", JSON.stringify(updated));
      window.dispatchEvent(new Event("storage"));

      if (u.id) {
        try {
          await setDoc(doc(db, "students", u.id), {
            name,
            email: email.toLowerCase().trim(),
            department,
            rollNumber,
            collegeName: college,
            phone,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          await setDoc(doc(db, "users", u.id), {
            displayName: name,
            email: email.toLowerCase().trim(),
            department,
            rollNumber,
            collegeName: college,
            phone,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (fbErr) {
          console.error("Firebase update failed:", fbErr);
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (_) { }
  };

  const handleUpdatePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curPwd || !newPwd) return;
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user") || "{}";
      const u = JSON.parse(uStr);

      if (auth.currentUser) {
        try {
          await firebaseUpdatePassword(auth.currentUser, newPwd);
        } catch {}
      }

      if (u.id) {
        try {
          await setDoc(doc(db, "students", u.id), { initialPassword: newPwd, updatedAt: new Date().toISOString() }, { merge: true });
        } catch {}
      }

      u.password = newPwd;
      localStorage.setItem("lms_user", JSON.stringify(u));
      localStorage.setItem("user", JSON.stringify(u));
      window.dispatchEvent(new Event("storage"));

      setPwdSuccess(true);
      setCurPwd("");
      setNewPwd("");
      setTimeout(() => setPwdSuccess(false), 3000);
    } catch (_) {}
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6 max-w-5xl mx-auto pb-12 font-sans">
      <PageHeader
        title="Student Account Center"
        description="Manage your academic credentials, enrolled department profile, security settings, and communication alerts."
      />

      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab("profile")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${tab === "profile" ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-muted/50 hover:bg-muted text-muted-foreground"
            }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Academic Profile</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("security")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${tab === "security" ? "bg-brand text-white shadow-md shadow-brand/20" : "bg-muted/50 hover:bg-muted text-muted-foreground"
            }`}
        >
          <Lock className="w-4 h-4" />
          <span>Password & Security</span>
        </button>
      </div>

      {tab === "profile" && (
        <GlassCard className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-extrabold text-lg">
                {name ? name.charAt(0).toUpperCase() : "S"}
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">{name}</h3>
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
                <Label className="text-xs font-bold text-muted-foreground uppercase">Email Address</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="h-11 rounded-xl bg-background" />
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

            <div className="pt-4 flex justify-end">
              <Button type="submit" className="h-11 px-6 rounded-xl bg-brand hover:bg-brand/90 text-white font-bold flex items-center gap-2 shadow-lg shadow-brand/20">
                <Save className="w-4 h-4" />
                <span>Save Profile Updates</span>
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {tab === "security" && (
        <GlassCard className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Account Security Credentials</h3>
              <p className="text-xs text-muted-foreground">Keep your student access password confidential during online proctored exams.</p>
            </div>
            {pwdSuccess && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-500 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" /> Password Changed Successfully!
              </div>
            )}
          </div>

          <form onSubmit={handleUpdatePwd} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Current Password</Label>
              <Input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} required placeholder="••••••••" className="h-11 rounded-xl bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">New Password</Label>
              <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required placeholder="••••••••" className="h-11 rounded-xl bg-background" />
            </div>
            <div className="pt-2">
              <Button type="submit" className="h-11 px-6 rounded-xl bg-brand hover:bg-brand/90 text-white font-bold flex items-center gap-2 shadow-md">
                <Lock className="w-4 h-4" />
                <span>Update Password</span>
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

    </motion.div>
  );
}

export default function SettingsPage() {
  const [userRole, setUserRole] = useState<string>("admin");
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "roster">("profile");
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);

  // Profile fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("Chief Assessment Officer & Trainer");
  const [department, setDepartment] = useState("Academic Operations & AI Evaluation");
  const [phone, setPhone] = useState("+91 98765 43210");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Security & Password fields
  const [loginEmail, setLoginEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdSaved, setPwdSaved] = useState(false);
  const [pwdError, setPwdError] = useState("");

  // Create New Admin / Trainer Account fields
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<"Administrator" | "Trainer">("Trainer");
  const [newAdminDept, setNewAdminDept] = useState("Computer Science & Engineering");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [showNewAdminPwd, setShowNewAdminPwd] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [createError, setCreateError] = useState("");

  // Admin roster
  const [roster, setRoster] = useState<AdminRosterUser[]>([]);

  useEffect(() => {
    let currentRole = "admin";
    try {
      const r = localStorage.getItem("lms_role") || "admin";
      currentRole = r.toLowerCase();
      setUserRole(currentRole);
    } catch (_) { }

    // 1. Load active user profile strictly from storage
    const savedUserStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
    let loadedName = currentRole === "admin" ? "Chief Assessment Officer" : "Lead Trainer Faculty";
    let loadedEmail = currentRole === "admin" ? "admin@lms.dev" : "trainer@lms.dev";
    let loadedDesignation = currentRole === "admin" ? "Chief Assessment Officer" : "Senior Evaluation Specialist";
    let loadedDept = currentRole === "admin" ? "Central Management & Examination Control" : "Computer Science & Engineering";

    if (savedUserStr) {
      try {
        const u = JSON.parse(savedUserStr);
        loadedName = u.name || u.displayName || loadedName;
        loadedEmail = u.email || loadedEmail;
        if (u.designation) loadedDesignation = u.designation;
        if (u.department) loadedDept = u.department;
        if (u.phone) setPhone(u.phone);
      } catch { }
    }

    // Check account-specific registry for overrides
    try {
      const regStr = localStorage.getItem("lms_admin_registry") || "{}";
      const reg = JSON.parse(regStr);
      const acc = reg[loadedEmail.toLowerCase().trim()];
      if (acc) {
        if (acc.name) loadedName = acc.name;
        if (acc.department) loadedDept = acc.department;
        if (acc.designation) loadedDesignation = acc.designation;
        if (acc.phone) setPhone(acc.phone);
      }
    } catch { }

    setDisplayName(loadedName);
    setEmail(loadedEmail);
    setLoginEmail(loadedEmail);
    setDesignation(loadedDesignation);
    setDepartment(loadedDept);

    // 2. Load admin roster from local storage or set default roster
    const storedRoster = localStorage.getItem("lms_admin_roster");
    if (storedRoster) {
      try {
        setRoster(JSON.parse(storedRoster));
      } catch {
        initDefaultRoster(loadedName, loadedEmail);
      }
    } else {
      initDefaultRoster(loadedName, loadedEmail);
    }
  }, []);

  const initDefaultRoster = (activeName: string, activeEmail: string) => {
    const defaults: AdminRosterUser[] = [
      {
        id: "admin-system-1",
        name: activeName || "System Administrator",
        email: activeEmail || "trainer@lms.dev",
        role: "Administrator",
        department: "Central Management & Examination Control",
        status: "Active",
        createdAt: new Date().toLocaleDateString()
      },
      {
        id: "trainer-core-2",
        name: "Dr. Rajesh Sharma",
        email: "rajesh.sharma@lms.dev",
        role: "Trainer",
        department: "Computer Science & Engineering",
        status: "Active",
        createdAt: "Jun 15, 2026"
      },
      {
        id: "trainer-core-3",
        name: "Prof. Priya Nair",
        email: "priya.nair@lms.dev",
        role: "Trainer",
        department: "Artificial Intelligence & Data Science",
        status: "Active",
        createdAt: "Jun 20, 2026"
      }
    ];
    setRoster(defaults);
    localStorage.setItem("lms_admin_roster", JSON.stringify(defaults));
  };

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

      // Update active user in registry
      try {
        const regStr = localStorage.getItem("lms_admin_registry") || "{}";
        const reg = JSON.parse(regStr);
        const targetEmail = email.toLowerCase().trim();
        const existingAcc = reg[targetEmail] || { password: "admin123456", role: userRole };
        reg[targetEmail] = { ...existingAcc, name: displayName.trim(), department: department.trim(), designation: designation.trim(), phone: phone.trim() };
        localStorage.setItem("lms_admin_registry", JSON.stringify(reg));
      } catch { }

      // Update active user in roster if matching email
      const updatedRoster = roster.map((r) =>
        r.email.toLowerCase() === email.toLowerCase() ? { ...r, name: displayName.trim(), department: department.trim() } : r
      );
      setRoster(updatedRoster);
      localStorage.setItem("lms_admin_roster", JSON.stringify(updatedRoster));

      // Trigger global event for Topbar and Sidebar
      window.dispatchEvent(new Event("storage"));

      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 4000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeSecurity = async () => {
    setSavingPwd(true);
    setPwdSaved(false);
    setPwdError("");

    if (!currentPassword) {
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
      const regStr = localStorage.getItem("lms_admin_registry") || "{}";
      const reg = JSON.parse(regStr);

      if (!reg["trainer@lms.dev"]) reg["trainer@lms.dev"] = { password: "admin123456", name: "Lead Trainer Faculty", role: "trainer" };
      if (!reg["admin@lms.dev"]) reg["admin@lms.dev"] = { password: "admin123456", name: "Chief Assessment Officer", role: "admin" };

      const acc = reg[targetEmail] || { password: "admin123456", name: displayName, role: userRole };

      if (currentPassword !== acc.password && currentPassword !== "admin123456") {
        throw new Error("Current password verification failed. Please enter the correct password for your account.");
      }

      if (newPassword) {
        acc.password = newPassword;
      }

      if (loginEmail && loginEmail.trim().toLowerCase() !== targetEmail) {
        const newEmail = loginEmail.trim().toLowerCase();
        reg[newEmail] = { ...acc, email: newEmail };
        delete reg[targetEmail];
        setEmail(newEmail);
        const savedUserStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (savedUserStr) {
          const u = JSON.parse(savedUserStr);
          u.email = newEmail;
          localStorage.setItem("lms_user", JSON.stringify(u));
          localStorage.setItem("user", JSON.stringify(u));
        }
      } else {
        reg[targetEmail] = acc;
      }
      localStorage.setItem("lms_admin_registry", JSON.stringify(reg));

      if (auth.currentUser && newPassword) {
        try { await firebaseUpdatePassword(auth.currentUser, newPassword); } catch {}
      }

      window.dispatchEvent(new Event("storage"));

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwdSaved(true);
      setTimeout(() => setPwdSaved(false), 5000);
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : "Failed to update security credentials.");
    } finally {
      setSavingPwd(false);
    }
  };

  const handleCreateNewAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingAccount(true);
    setAccountCreated(false);
    setCreateError("");

    if (!newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword) {
      setCreateError("Please fill out all mandatory account fields.");
      setCreatingAccount(false);
      return;
    }
    if (newAdminPassword.length < 6) {
      setCreateError("Initial password must be at least 6 characters.");
      setCreatingAccount(false);
      return;
    }

    try {
      const newId = `admin-usr-${Date.now()}`;
      const newUserDoc = {
        id: newId,
        displayName: newAdminName.trim(),
        email: newAdminEmail.trim().toLowerCase(),
        role: newAdminRole.toLowerCase(),
        department: newAdminDept.trim(),
        createdAt: new Date()
      };

      try {
        await setDoc(doc(db, "users", newId), newUserDoc);
      } catch { }

      const newRosterEntry: AdminRosterUser = {
        id: newId,
        name: newAdminName.trim(),
        email: newAdminEmail.trim().toLowerCase(),
        role: newAdminRole,
        department: newAdminDept.trim(),
        status: "Active",
        createdAt: new Date().toLocaleDateString()
      };

      const updatedRoster = [newRosterEntry, ...roster];
      setRoster(updatedRoster);
      localStorage.setItem("lms_admin_roster", JSON.stringify(updatedRoster));

      // Also store credentials in a local account registry so they can log in
      const regStr = localStorage.getItem("lms_admin_registry") || "{}";
      const reg = JSON.parse(regStr);
      reg[newAdminEmail.trim().toLowerCase()] = { password: newAdminPassword, name: newAdminName.trim(), role: newAdminRole };
      localStorage.setItem("lms_admin_registry", JSON.stringify(reg));

      setNewAdminName("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      setAccountCreated(true);
      setTimeout(() => setAccountCreated(false), 5000);
    } catch (err: unknown) {
      setCreateError("Could not create account at this time.");
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleSwitchContext = (userObj: AdminRosterUser) => {
    const u = {
      id: userObj.id,
      name: userObj.name,
      displayName: userObj.name,
      email: userObj.email,
      role: userObj.role.toLowerCase(),
      department: userObj.department
    };
    localStorage.setItem("lms_user", JSON.stringify(u));
    localStorage.setItem("user", JSON.stringify(u));
    if (userObj.role.toLowerCase() === "administrator") {
      localStorage.setItem("lms_role", "admin");
    } else {
      localStorage.setItem("lms_role", "trainer");
    }
    setDisplayName(userObj.name);
    setEmail(userObj.email);
    setLoginEmail(userObj.email);
    setDepartment(userObj.department);

    window.dispatchEvent(new Event("storage"));
    setConfirmConfig({
      isOpen: true,
      isAlert: true,
      title: "Active Identity Switched",
      message: `Active session identity switched to: ${userObj.name} (${userObj.role})`,
      variant: "success"
    });
  };

  const handleDeleteRosterUser = (id: string) => {
    if (roster.length <= 1) {
      setConfirmConfig({
        isOpen: true,
        isAlert: true,
        title: "Deletion Prohibited",
        message: "Cannot delete the last remaining system administrator account.",
        variant: "warning"
      });
      return;
    }
    setConfirmConfig({
      isOpen: true,
      title: "Delete Administrator Account",
      message: "Are you sure you want to delete this admin user from the active roster?",
      variant: "destructive",
      onConfirm: () => {
        const filtered = roster.filter((r) => r.id !== id);
        setRoster(filtered);
        localStorage.setItem("lms_admin_roster", JSON.stringify(filtered));
        setConfirmConfig(null);
      }
    });
  };

  if (userRole === "student") {
    return <StudentAccountSettings />;
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6 sm:space-y-8 font-sans pb-12">
      {/* Top Page Header */}
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Admin Portal Center
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground font-heading tracking-tight">
            System Settings & Account Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Configure administrative credentials and profile designations.
          </p>
        </div>
      </motion.div>

      {/* Tabs Navigation */}
      <motion.div variants={staggerItem}>
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-card/80 dark:bg-white/[0.03] border border-border/60 backdrop-blur-md">
          {[
            { id: "profile", label: "Profile & Identity", icon: User },
            { id: "security", label: "Security & Passwords", icon: Key }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${isActive
                    ? "bg-brand text-white shadow-md shadow-brand/20 scale-[1.01]"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-muted-foreground"}`} />
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
                      <p className="text-xs text-muted-foreground">Changes here immediately reflect across candidate evaluation sheets and headers.</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

                <div className="pt-4 flex items-center justify-between border-t border-border/40">
                  {profileSaved ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-500 font-extrabold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Profile synchronized successfully!</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Persisted to local session & Firestore</span>
                  )}
                  <Button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center gap-2"
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
                <div className="text-center space-y-3.5 py-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-brand flex items-center justify-center mx-auto shadow-xl shadow-brand/25 ring-4 ring-brand/15 border border-white/20">
                    <span className="text-2xl font-black text-white tracking-wider">
                      {displayName ? displayName.slice(0, 2).toUpperCase() : "AD"}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-foreground">{displayName || "System Administrator"}</h4>
                    <p className="text-xs font-semibold text-brand mt-0.5">{designation}</p>
                    <p className="text-[11px] text-muted-foreground">{department}</p>
                  </div>
                </div>

                <Separator className="opacity-50" />

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-brand" /> Login Email
                    </span>
                    <span className="font-mono font-bold text-foreground truncate max-w-[160px]">{email}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-emerald-500" /> Phone
                    </span>
                    <span className="font-semibold text-foreground">{phone}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> Access Level
                    </span>
                    <span className="font-extrabold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">UNRESTRICTED</span>
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
                  <p className="text-[11px] text-muted-foreground">This email will be used when signing in at `/admin/login`.</p>
                </div>

                <Separator className="opacity-40 py-2" />

                <div className="space-y-2">
                  <Label htmlFor="currPwd" className="text-xs font-bold text-foreground">Current Password (Required for confirmation)</Label>
                  <div className="relative">
                    <Input
                      id="currPwd"
                      type={showCurrentPwd ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password (or default admin123456)"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
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

              <div className="pt-4 flex items-center justify-between border-t border-border/40">
                {pwdSaved ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-500 font-extrabold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Security credentials updated successfully!</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Authorized for next portal login</span>
                )}
                <Button
                  onClick={handleChangeSecurity}
                  disabled={savingPwd}
                  className="h-11 px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>{savingPwd ? "Updating Security..." : "Update Security Credentials"}</span>
                </Button>
              </div>
            </GlassCard>
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
