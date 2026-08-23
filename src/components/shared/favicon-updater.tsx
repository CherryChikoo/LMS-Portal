"use client";

import { useEffect } from "react";
import { useBranding } from "@/providers/branding-provider";

export function FaviconUpdater() {
  const { branding, tenantBranding } = useBranding();

  useEffect(() => {
    const updateFavicon = () => {
      // Remove all existing favicon links
      const existingIcons = document.querySelectorAll("link[rel*='icon']");
      existingIcons.forEach((icon) => icon.remove());

      // Get the appropriate logo
      let logoBase64 = tenantBranding?.logoBase64 || branding?.logoBase64;

      // Create new favicon link
      const link = document.createElement("link");
      link.rel = "icon";
      
      if (logoBase64) {
        // Use the actual logo
        link.href = logoBase64;
      } else {
        // Use a timestamp to bust cache and force fetch from API
        link.href = `/api/branding/favicon?t=${Date.now()}`;
      }
      
      document.head.appendChild(link);

      // Also add shortcut icon
      const shortcut = document.createElement("link");
      shortcut.rel = "shortcut icon";
      shortcut.href = link.href;
      document.head.appendChild(shortcut);

      // Also add apple-touch-icon
      const apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      apple.href = link.href;
      document.head.appendChild(apple);
    };

    updateFavicon();

    // Listen for branding updates
    const handleBrandingUpdate = () => {
      setTimeout(updateFavicon, 100);
    };

    window.addEventListener("lms_branding_updated", handleBrandingUpdate);
    window.addEventListener("storage", handleBrandingUpdate);

    return () => {
      window.removeEventListener("lms_branding_updated", handleBrandingUpdate);
      window.removeEventListener("storage", handleBrandingUpdate);
    };
  }, [branding, tenantBranding]);

  return null;
}
