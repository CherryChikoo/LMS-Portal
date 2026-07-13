"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isNavigating) {
      setProgress(100);
      const timer = setTimeout(() => {
        setIsNavigating(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || target.getAttribute("target") === "_blank" || target.hasAttribute("download")) {
        return;
      }

      const currentPath = window.location.pathname;
      const targetUrl = new URL(target.href, window.location.origin);
      if (targetUrl.pathname !== currentPath || targetUrl.search !== window.location.search) {
        setIsNavigating(true);
        setProgress(20);
      }
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });
    return () => document.removeEventListener("click", handleDocumentClick, { capture: true });
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isNavigating && progress < 85) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) return prev;
          const diff = (85 - prev) * 0.2;
          return prev + Math.max(diff, 1);
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isNavigating, progress]);

  if (!isNavigating && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 pointer-events-none bg-transparent overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.9)]"
        initial={{ width: "0%" }}
        animate={{ width: `${progress}%`, opacity: progress === 100 ? 0 : 1 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
