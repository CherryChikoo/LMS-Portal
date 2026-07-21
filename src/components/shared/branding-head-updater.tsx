"use client";

import { useEffect } from "react";
import { useBranding } from "@/providers/branding-provider";
import { APP_NAME } from "@/lib/constants";

export function BrandingHeadUpdater() {
  const { branding, loading } = useBranding();

  useEffect(() => {
    if (loading) return;

    // Update document title
    const siteName = branding.companyName || APP_NAME;
    
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
  }, [branding, loading]);

  return null;
}
