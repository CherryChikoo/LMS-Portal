"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useBranding } from "@/providers/branding-provider";
import { APP_NAME } from "@/lib/constants";

/**
 * Resolves the correct portal title based on user role and cached branding.
 * College admins/students always get their college name, not the global admin name.
 */
function resolvePortalTitle(fallbackBranding: string | undefined): string {
  if (typeof window === "undefined") return fallbackBranding || APP_NAME;

  try {
    const roleStr = (localStorage.getItem("lms_role") || "").toLowerCase().trim();
    const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
    
    let role = roleStr;
    if (!role && uStr) {
      const parsed = JSON.parse(uStr);
      role = (parsed.role || "").toLowerCase().trim();
    }

    // For college-scoped users, always prefer college branding
    if (role === "college_admin" || role === "college_student" || role === "student") {
      const cachedCollege = localStorage.getItem("lms_college_branding");
      if (cachedCollege) {
        const cParsed = JSON.parse(cachedCollege);
        if (cParsed.branding?.companyName) return cParsed.branding.companyName;
        if (cParsed.name) return cParsed.name;
      }
      // Fallback: read collegeName directly from user profile
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.collegeName) return parsed.collegeName;
      }
    }
  } catch {}

  return fallbackBranding || APP_NAME;
}

export function BrandingHeadUpdater() {
  const { branding, loading } = useBranding();
  const pathname = usePathname();
  const isLoggingOut = useRef(false);
  const desiredTitleRef = useRef<string>("");

  useEffect(() => {
    const handleLogout = () => {
      isLoggingOut.current = true;
    };
    window.addEventListener("lms_logout", handleLogout);
    return () => window.removeEventListener("lms_logout", handleLogout);
  }, []);

  // Forcefully set document.title
  const enforceTitle = useCallback(() => {
    if (isLoggingOut.current) return;
    const desired = desiredTitleRef.current;
    if (desired && document.title !== desired) {
      document.title = desired;
    }
  }, []);

  useEffect(() => {
    if (isLoggingOut.current) return;

    // Resolve the correct title
    const resolvedTitle = resolvePortalTitle(branding.companyName);
    desiredTitleRef.current = resolvedTitle;

    // Set immediately
    if (resolvedTitle && document.title !== resolvedTitle) {
      document.title = resolvedTitle;
    }

    // Observe the <head> element for ANY title changes (including element replacement).
    // Next.js App Router replaces the entire <title> element on soft navigations,
    // which would disconnect an observer attached to the old <title> node.
    const headObserver = new MutationObserver(() => {
      enforceTitle();
    });

    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Failsafe: poll every 500ms for the first 3 seconds after navigation
    // to catch any delayed title changes from streaming SSR
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      enforceTitle();
      pollCount++;
      if (pollCount >= 6) clearInterval(pollInterval);
    }, 500);

    // Safe in-place Favicon update
    let targetFavicon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    
    // Check if user is a college tenant using localStorage
    let isCollege = false;
    try {
      const storedRole = (localStorage.getItem("lms_role") || "").toLowerCase().trim();
      let activeRole = storedRole;
      if (!activeRole) {
        const storedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (storedUser) activeRole = JSON.parse(storedUser).role?.toLowerCase().trim();
      }
      isCollege = activeRole === "college_admin" || activeRole === "college_student" || activeRole === "student";
    } catch (_) {}

    // Persist branding in localStorage for instant pre-hydration (only for main admins)
    try {
      if (!isCollege && (branding.companyName || branding.logoBase64)) {
        localStorage.setItem("lms_branding", JSON.stringify(branding));
      }
    } catch (_) {}

    if (isCollege) {
      // Use a transparent 1x1 PNG unconditionally for college tenants as requested
      targetFavicon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    } else if (branding.logoBase64) {
      targetFavicon = branding.logoBase64;
    } else {
      targetFavicon = "/api/branding/favicon";
    }

    try {
      const existingIcons = document.querySelectorAll("link[rel*='icon']");
      if (existingIcons.length > 0) {
        existingIcons.forEach((el) => {
          (el as HTMLLinkElement).href = targetFavicon;
        });
      } else {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = targetFavicon;
        document.head.appendChild(link);
      }
    } catch (_) {}

    return () => {
      headObserver.disconnect();
      clearInterval(pollInterval);
    };
  }, [branding, loading, pathname, enforceTitle]);

  return null;
}
