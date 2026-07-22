import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/config";

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
  return "admin";
}

export async function setAuthSession(
  session: string | Record<string, unknown>,
  role: "student" | "admin" | "trainer" | "college_admin",
  user?: Record<string, unknown>
): Promise<void> {
  const normalizedRole = role === "trainer" ? "admin" : role;
  const isSecure = window.location.protocol === "https:";
  const cookieOptions = `path=/; max-age=86400; SameSite=Lax${isSecure ? "; Secure" : ""}`;

  if (typeof session === "string") {
    // session is a Firebase ID token
    localStorage.setItem("lms_token", session);
    localStorage.setItem("lms_auth", "true");
  } else {
    // session is a user profile object (legacy / email-password flow)
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
 * Resolve the currently authenticated Firebase user, falling back to the
 * cached localStorage profile when Firebase Auth is still initializing.
 * Returns the Firebase uid and email so student-facing pages can filter
 * Firestore queries by the current student instead of fetching all rows.
 */
export function getCurrentUser(): Promise<{ uid: string; email: string; profile: Record<string, unknown> } | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    let profile: Record<string, unknown> | null = null;
    try {
      const stored = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (stored) profile = JSON.parse(stored);
    } catch {
      profile = null;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribe();
      if (firebaseUser) {
        resolve({
          uid: firebaseUser.uid,
          email: firebaseUser.email || (profile?.email as string) || "",
          profile: profile || {},
        });
      } else if (profile && profile.id) {
        resolve({
          uid: (profile.id as string) || (profile.uid as string) || "",
          email: (profile.email as string) || "",
          profile,
        });
      } else {
        resolve(null);
      }
    });
  });
}

export async function clearAuthSession(redirectPath?: string): Promise<void> {
  // Capture the role before clearing any storage so we can route to the correct login page.
  const role = getLogoutRole();
  const targetPath = redirectPath || "/login";

  // Invalidate all storage
  localStorage.clear();
  sessionStorage.clear();

  // Expire cookies immediately with matching attributes so the next request is unauthenticated.
  const isSecure = window.location.protocol === "https:";
  const cookieOptions = `path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${isSecure ? "; Secure" : ""}`;
  document.cookie = `lms_auth=; ${cookieOptions}`;
  document.cookie = `lms_role=; ${cookieOptions}`;

  window.dispatchEvent(new Event("storage"));

  // Allow a microtask for cookie deletion to propagate before navigation.
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  // Hard replace location so browser history cannot navigate back to authenticated pages.
  window.location.replace(targetPath);
}
