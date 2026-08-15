import { supabase } from "@/lib/supabase/client";
import { setAuthSession, clearAuthSession } from "@/lib/utils/auth-session";
import { invalidateLMSCache } from "@/lib/data/lms-data-cache";
import type { User, UserRole, Student } from "@/types";

type ExtendedUser = User & Record<string, unknown>;

import {
  getAuthProfileDataAction,
  clearMustChangePasswordAction,
  registerStudentDocsAction,
  studentRegisterServerAction
} from "@/lib/actions/auth-actions";


export async function verifyEmailRegistration(email: string) {
  try {
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return { exists: false };
    return await res.json();
  } catch (err) {
    return { exists: false };
  }
}

export async function unifiedLogin(email: string, pass: string): Promise<{ user: any; profile: ExtendedUser | null; role: UserRole | string; mustChangePassword?: boolean }> {
  const cleanEmail = email.toLowerCase().trim();
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: pass
  });

  if (error || !data.user || !data.session) {
    throw new Error(error?.message || "Invalid credentials or incorrect password.");
  }

  const uid = data.user.id;
  const { profile: rawProfile, studentDoc, collegeStatus } = await getAuthProfileDataAction(uid);

  if (!rawProfile) {
    throw new Error("Unauthorized: Account not found in directory.");
  }

  let profile = rawProfile as any;
  const role = profile.role;

  // 1. Direct user status check (applies to student, college_admin, trainer, etc.)
  if (profile?.status === "restricted") {
    await supabase.auth.signOut();
    throw new Error("RESTRICTED_ACCOUNT: Your LMS account has been temporarily restricted by an administrator.");
  }
  if (profile?.status === "deleted") {
    await supabase.auth.signOut();
    throw new Error("ACCOUNT_DELETED: Your account has been permanently deleted.");
  }

  // 2. College / Institution restriction check (blocks college admin logins if their college is restricted, while students retain access)
  if (collegeStatus === "restricted" && (role === "college_admin" || role === "college")) {
    await supabase.auth.signOut();
    throw new Error("RESTRICTED_ACCOUNT: College admin access for this institution has been temporarily restricted by the administrator.");
  }

  if (role === "student" && studentDoc) {
    profile = {
      ...profile,
      id: studentDoc.id || uid,
      email: profile.email || cleanEmail,
      displayName: profile.displayName || "Student",
      department: studentDoc.department || (profile as any).department || "Computer Science & Engineering",
      collegeId: studentDoc.collegeId || profile.collegeId || "",
      collegeName: (profile as any).collegeName || studentDoc.colleges?.name || "",
      academicYear: studentDoc.academicYear || (profile as any).academicYear,
      section: studentDoc.section || (profile as any).section,
      batchIds: (profile as any).batchIds || [],
    } as any;
  }

  const sessionUser = {
    id: profile.id || uid,
    authId: uid,
    name: profile.displayName || profile.name || "User",
    email: profile.email || cleanEmail,
    role,
    department: profile.department,
    collegeId: profile.collegeId,
    collegeName: profile.collegeName,
    academicYear: profile.academicYear,
    section: profile.section,
    batchIds: profile.batchIds || [],
    createdAt: (studentDoc as any)?.createdAt || profile.createdAt || Date.now(),
  };

  await setAuthSession(data.session.access_token, role as UserRole, sessionUser);

  return { user: data.user, profile: profile as ExtendedUser, role, mustChangePassword: false };
}

export async function logoutUser(): Promise<void> {
  invalidateLMSCache();
  const redirectPromise = clearAuthSession();
  supabase.auth.signOut().catch(() => {});
  return redirectPromise;
}

export async function updateFirstLoginPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const uid = user.id;
    await clearMustChangePasswordAction(uid);
  }
}

export async function resetUserPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

export async function studentRegister(
  fullName: string,
  collegeEmail: string,
  password: string,
  collegeName: string,
  department: string = "Computer Science & Engineering",
  section: string = "A"
): Promise<{ user: any; uid: string; collegeId: string | null }> {
  const result = await studentRegisterServerAction({
    fullName,
    email: collegeEmail,
    password,
    collegeName,
    department,
    section
  });

  try {
    await supabase.auth.signInWithPassword({
      email: collegeEmail.toLowerCase().trim(),
      password: password
    });
  } catch (_) {}

  return { 
    user: result.user, 
    uid: result.uid, 
    collegeId: result.collegeId 
  };
}

export async function unifiedGoogleLogin(mode: "login" | "register" = "login"): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.setItem("oauth_mode", mode);
  }
  const redirectUrl = typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback?mode=${mode}`
    : `http://localhost:3000/auth/callback?mode=${mode}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      }
    }
  });

  if (error) {
    throw new Error(error.message || "Failed to initiate Google Sign-In");
  }
}

export const studentGoogleLogin = () => unifiedGoogleLogin("login");
export const studentGoogleSignUp = () => unifiedGoogleLogin("register");
export const trainerGoogleLogin = () => unifiedGoogleLogin("login");
export async function completeStudentAcademicDetails() {
  return { resolvedCollegeId: "", resolvedCollegeName: "" };
}

export function formatAuthError(err: any): string { return err?.message || "Authentication error"; }
