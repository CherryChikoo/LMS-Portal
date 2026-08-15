import { UserRole } from '@/types';
import { supabase } from '@/lib/supabase/client';

/**
 * Central utility for managing client-side authentication sessions, storage, and cookies.
 */

function getLogoutRole(): "student" | "admin" | "college_admin" {
  // Prefer the cookie (source of truth for middleware) over localStorage.
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )lms_role=([^;]*)/);
    if (match) {
      const cookieRole = decodeURIComponent(match[1]).trim();
      if (cookieRole === "student") return "student";
      if (cookieRole === "college_admin") return "college_admin";
      if (cookieRole === "admin" || cookieRole === "trainer") return "admin";
    }
  }
  const lsRole = typeof localStorage !== "undefined" ? localStorage.getItem("lms_role") : null;
  if (lsRole === "student") return "student";
  if (lsRole === "college_admin") return "college_admin";
  return "student";
}

export async function setAuthSession(
  session: string | Record<string, unknown>,
  role: UserRole,
  user?: Record<string, unknown>
): Promise<void> {
  const normalizedRole = role === "trainer" ? "admin" : role;
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  // 30 days session persistence (2592000 seconds)
  const cookieOptions = `path=/; max-age=2592000; SameSite=Lax${isSecure ? "; Secure" : ""}`;

  if (typeof session === "string") {
    // session is an ID token
    localStorage.setItem("lms_token", session);
    localStorage.setItem("lms_auth", "true");
  } else {
    // session is a user profile object
    localStorage.setItem("lms_user", JSON.stringify(session));
    localStorage.setItem("user", JSON.stringify(session));
    localStorage.setItem("lms_auth", "true");
  }

  if (user) {
    localStorage.setItem("lms_user", JSON.stringify(user));
    localStorage.setItem("user", JSON.stringify(user));
  }

  localStorage.setItem("lms_role", normalizedRole);

  // Set secure cookies for Next.js middleware verification with consistent attributes
  document.cookie = `lms_auth=true; ${cookieOptions}`;
  document.cookie = `lms_role=${normalizedRole}; ${cookieOptions}`;

  window.dispatchEvent(new Event("storage"));
}

/**
 * Resolve the currently authenticated user, falling back to the
 * cached localStorage profile when auth is still initializing.
 */
export async function getCurrentUser(): Promise<{ uid: string; email: string; profile: Record<string, unknown> } | null> {
  if (typeof window === "undefined") {
    return null;
  }

  let profile: Record<string, unknown> | null = null;
  try {
    const stored = localStorage.getItem("lms_user") || localStorage.getItem("user");
    if (stored) profile = JSON.parse(stored);
  } catch {
    profile = null;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return {
      uid: session.user.id,
      email: session.user.email || (profile?.email as string) || "",
      profile: profile || {},
    };
  }

  if (profile && (profile.id || profile.email)) {
    return {
      uid: (profile.id as string) || (profile.authId as string) || "",
      email: (profile.email as string) || "",
      profile: profile,
    };
  }

  return null;
}

export async function clearAuthSession(redirectPath?: string): Promise<void> {
  if (typeof window !== "undefined") {
    (window as any).__isLoggingOut = true;
  }

  const targetPath = redirectPath || "/login?logout=true";

  // Invalidate all storage
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {}

  // Expire cookies immediately across all possible domain variations
  if (typeof document !== "undefined") {
    const isSecure = window.location.protocol === "https:";
    const hostname = window.location.hostname;
    const domainVariations = ["", hostname, `.${hostname}`];

    domainVariations.forEach((dom) => {
      const domSuffix = dom ? `; domain=${dom}` : "";
      const cookieOptions = `path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${isSecure ? "; Secure" : ""}${domSuffix}`;
      document.cookie = `lms_auth=; ${cookieOptions}`;
      document.cookie = `lms_role=; ${cookieOptions}`;
      document.cookie = `lms_status=; ${cookieOptions}`;
    });
  }

  window.dispatchEvent(new Event("storage"));

  // Allow a microtask for cookie deletion to propagate before navigation.
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  // Hard replace location so browser history cannot navigate back to authenticated pages.
  window.location.replace(targetPath);
}
