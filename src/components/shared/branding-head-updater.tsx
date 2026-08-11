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
    if (loading) return;

    // Update document title
    const siteName = (userRole === "college_admin" || userRole === "student") && userCollegeId && !userCollegeId.startsWith("ext-") && userCollegeName
      ? userCollegeName
      : (branding.companyName || APP_NAME);
    
    // Attempt to retain any existing dynamic page prefixes if possible
    // e.g. "Dashboard - LMS Portal"
    const currentTitle = document.title;
    if (currentTitle.includes(" - ")) {
      const parts = currentTitle.split(" - ");
      parts[parts.length - 1] = siteName;
      document.title = parts.join(" - ");
    } else {
      document.title = siteName;
    }

    // Update or create favicon
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    
    if (branding.logoBase64) {
      link.href = branding.logoBase64;
    } else {
      link.href = "/favicon.ico"; // Fallback to default
    }
  }, [branding, loading, userRole, userCollegeId, userCollegeName, pathname]);

  return null;
}
