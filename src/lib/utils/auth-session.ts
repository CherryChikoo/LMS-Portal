/**
 * Central utility for managing client-side authentication sessions, storage, and cookies.
 */

export function setAuthSession(user: Record<string, any>, role: "student" | "admin" | "trainer"): void {
  const normalizedRole = role === "trainer" ? "admin" : role;
  localStorage.setItem("lms_role", normalizedRole);
  localStorage.setItem("lms_user", JSON.stringify(user));
  localStorage.setItem("user", JSON.stringify(user));

  // Set secure cookies for Next.js middleware verification
  document.cookie = `lms_auth=true; path=/; max-age=86400; SameSite=Lax`;
  document.cookie = `lms_role=${normalizedRole}; path=/; max-age=86400; SameSite=Lax`;

  window.dispatchEvent(new Event("storage"));
}

export function clearAuthSession(): void {
  const role = localStorage.getItem("lms_role") || "student";
  const redirectPath = role === "student" ? "/login" : "/admin/login";

  // Invalidate all storage
  localStorage.clear();
  sessionStorage.clear();

  // Expire cookies immediately
  document.cookie = "lms_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  document.cookie = "lms_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";

  window.dispatchEvent(new Event("storage"));

  // Hard replace location so browser history cannot navigate back to authenticated pages
  window.location.replace(redirectPath);
}
