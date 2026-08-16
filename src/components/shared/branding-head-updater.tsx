"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useBranding } from "@/providers/branding-provider";
import { APP_NAME } from "@/lib/constants";

export function BrandingHeadUpdater() {
  const { branding, loading } = useBranding();
  const pathname = usePathname();
  const isLoggingOut = useRef(false);

  useEffect(() => {
    const handleLogout = () => {
      isLoggingOut.current = true;
    };
    window.addEventListener("lms_logout", handleLogout);
    return () => window.removeEventListener("lms_logout", handleLogout);
  }, []);

  useEffect(() => {
    if (isLoggingOut.current) return;

    // 1. Resolve portal name deterministically
    let siteName = branding.companyName;

    if (typeof window !== "undefined") {
      try {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const roleStr = localStorage.getItem("lms_role") || "";
        
        let role = null;
        if (uStr) {
          const parsed = JSON.parse(uStr);
          role = (parsed.role || roleStr).toLowerCase();
        }

        if (role === "college_admin" || role === "college_student") {
          const cachedCollege = localStorage.getItem("lms_college_branding");
          if (cachedCollege) {
            const cParsed = JSON.parse(cachedCollege);
            if (cParsed.branding?.companyName) {
              siteName = cParsed.branding.companyName;
            } else if (cParsed.name) {
              siteName = cParsed.name;
            }
          }
          if (!siteName && uStr) {
            const parsed = JSON.parse(uStr);
            if (parsed.collegeName) siteName = parsed.collegeName;
          }
        }
      } catch {}
    }

    if (!siteName) {
      siteName = branding.companyName || APP_NAME;
    }

    const fullTitle = siteName;

    let observer: MutationObserver | null = null;
    if (typeof document !== "undefined" && fullTitle) {
      if (document.title !== fullTitle) {
        document.title = fullTitle;
      }

      // MutationObserver to prevent Next.js from reverting the title on soft navigations
      const titleElement = document.querySelector('title');
      
      if (titleElement) {
        observer = new MutationObserver(() => {
          if (isLoggingOut.current) {
            observer?.disconnect();
            return;
          }
          if (document.title !== fullTitle) {
            document.title = fullTitle;
          }
        });
        
        observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
      }
    }

    // 2. Persist in localStorage for instant pre-hydration head scripts
    try {
      if (branding.companyName || branding.logoBase64) {
        localStorage.setItem("lms_branding", JSON.stringify(branding));
      }
    } catch (_) {}

    // 3. Safe in-place Favicon update
    const targetFavicon = branding.logoBase64 || "/api/branding/favicon";
    try {
      const existingIcons = document.querySelectorAll("link[rel*='icon']");
      if (existingIcons.length > 0) {
        existingIcons.forEach((el) => {
          (el as HTMLLinkElement).href = targetFavicon;
        });
      }
    } catch (_) {}

    // Cleanup observer on unmount or deps change
    return () => {
      if (observer) observer.disconnect();
    };
  }, [branding, loading, pathname]);

  return null;
}

