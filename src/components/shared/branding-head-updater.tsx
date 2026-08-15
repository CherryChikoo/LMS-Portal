"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useBranding } from "@/providers/branding-provider";
import { APP_NAME } from "@/lib/constants";

export function BrandingHeadUpdater() {
  const { branding, loading } = useBranding();
  const pathname = usePathname();

  const [userRole, setUserRole] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const role = localStorage.getItem("lms_role") || localStorage.getItem("role");
      if (role) return role.toLowerCase();
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.role) return parsed.role.toLowerCase();
      }
    } catch {}
    return "student";
  });
  const [userCollegeId, setUserCollegeId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        return parsed.collegeId || null;
      }
    } catch {}
    return null;
  });
  const [userCollegeName, setUserCollegeName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        return parsed.collegeName || null;
      }
    } catch {}
    return null;
  });

  useEffect(() => {
    // 1. Update document title
    const isAdminRoute = pathname.startsWith("/admin");
    const isMainAdmin = userRole === "admin" || userRole === "master_admin" || userRole === "main_admin" || userRole === "superadmin" || userRole === "super_admin" || userRole === "trainer";
    const isCollegeSpecific = !isAdminRoute && !isMainAdmin && (userRole === "college_admin" || userRole === "student") && userCollegeId && !userCollegeId.startsWith("ext-") && userCollegeName;

    const siteName = isCollegeSpecific
      ? userCollegeName
      : (branding.companyName || "Masters Academy");
    
    if (siteName) {
      const currentTitle = document.title;
      if (currentTitle.includes(" - ")) {
        const parts = currentTitle.split(" - ");
        parts[parts.length - 1] = siteName;
        document.title = parts.join(" - ");
      } else {
        document.title = siteName;
      }
    }

    // 2. Persist in localStorage for instant pre-hydration head scripts
    try {
      if (branding.companyName || branding.logoBase64) {
        localStorage.setItem("lms_branding", JSON.stringify(branding));
      }
    } catch (_) {}

    // 3. Reliable Favicon Injection
    const targetFavicon = branding.logoBase64 || "/api/branding/favicon";

    // Remove all existing icon and shortcut icon links to force browser reload
    const existingIcons = document.querySelectorAll("link[rel*='icon']");
    existingIcons.forEach((el) => el.remove());

    // Create fresh standard icon link
    const iconLink = document.createElement("link");
    iconLink.rel = "icon";
    iconLink.type = targetFavicon.includes("svg") ? "image/svg+xml" : "image/png";
    iconLink.href = targetFavicon;
    document.head.appendChild(iconLink);

    // Create shortcut icon link
    const shortcutLink = document.createElement("link");
    shortcutLink.rel = "shortcut icon";
    shortcutLink.type = targetFavicon.includes("svg") ? "image/svg+xml" : "image/png";
    shortcutLink.href = targetFavicon;
    document.head.appendChild(shortcutLink);

    // Create apple-touch-icon link
    const appleLink = document.createElement("link");
    appleLink.rel = "apple-touch-icon";
    appleLink.href = targetFavicon;
    document.head.appendChild(appleLink);
  }, [branding, loading, userRole, userCollegeId, userCollegeName, pathname]);

  return null;
}
