"use client";

import { useEffect, useRef, useState } from "react";
import { useSidebar } from "@/hooks/use-sidebar";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { subscribeToLMSCache } from "@/lib/data/lms-data-cache";
import { ErrorBoundary } from "@/components/error-boundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded } = useSidebar();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Used to throttle the storage event dispatch to at most once per 2 seconds.
  const lastDispatchRef = useRef<number>(0);

  const pathname = usePathname();

  // Listen for logout freeze trigger
  useEffect(() => {
    const checkLogout = () => {
      if (typeof window !== "undefined" && (window as any).__isLoggingOut) {
        setIsLoggingOut(true);
      }
    };
    checkLogout();
    window.addEventListener("storage", checkLogout);
    return () => window.removeEventListener("storage", checkLogout);
  }, []);

  // Auth verification effect - runs when pathname changes
  useEffect(() => {
    const verifyAuth = () => {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (!uStr) {
        import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
          clearAuthSession("/login");
        });
      } else {
        try {
          const parsed = JSON.parse(uStr);
          if (parsed.role === "college_admin") {
            const forbiddenPaths = ["/audit", "/admin/audit"];
            if (forbiddenPaths.includes(pathname)) {
              window.location.replace("/");
            }
          }
        } catch (_) {}
      }
    };
    verifyAuth();
    window.addEventListener("pageshow", verifyAuth);
    return () => window.removeEventListener("pageshow", verifyAuth);
  }, [pathname]);

  // Firebase real-time sync effect - runs once on mount
  useEffect(() => {
    const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
    if (!uStr) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsedUser shape comes from a JSON.parse() of the locally stored session blob
    let parsedUser: any = null;
    try {
      parsedUser = JSON.parse(uStr);
    } catch {
      return;
    }

    if (!parsedUser || !parsedUser.id) return;

    const unsubs: (() => void)[] = [];

    // Helper: only commit + dispatch when the parsed relevant fields actually changed.
    // Storage event dispatch is also throttled to at most once per 2 seconds.
    const commitIfChanged = (updated: Record<string, unknown>, relevantKeys: string[]) => {
      const existingStr = localStorage.getItem("lms_user");
      const existingRelevant: Record<string, unknown> = {};
      if (existingStr) {
        try {
          const parsed = JSON.parse(existingStr);
          for (const k of relevantKeys) existingRelevant[k] = parsed[k];
        } catch {
          // ignore parse errors and treat as no existing data
        }
      }

      let changed = false;
      for (const k of relevantKeys) {
        const a = JSON.stringify(existingRelevant[k] ?? null);
        const b = JSON.stringify(updated[k] ?? null);
        if (a !== b) {
          changed = true;
          break;
        }
      }
      if (!changed) return;

      const strNew = JSON.stringify(updated);
      localStorage.setItem("lms_user", strNew);
      localStorage.setItem("user", strNew);

      const now = Date.now();
      if (now - lastDispatchRef.current > 2000) {
        lastDispatchRef.current = now;
        window.dispatchEvent(new Event("storage"));
      }
    };

    let authUnsub: (() => void) | null = null;
    let syncUnsubs: (() => void)[] = [];

    import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
      import("@/lib/firebase/config").then(({ app }) => {
        const auth = getAuth(app);
        authUnsub = onAuthStateChanged(auth, (user) => {
          // Clear any existing sync subscriptions if auth state changes
          syncUnsubs.forEach((u) => u());
          syncUnsubs = [];

          // Only sync if Firebase Auth confirms we are logged in
          if (!user) return;

          if (parsedUser.role === "student") {
            import("firebase/firestore").then(({ doc, getDoc }) => {
              import("@/lib/firebase/config").then(async ({ db }) => {
                try {
                  const docSnap = await getDoc(doc(db, "students", parsedUser.id));
                  if (!docSnap.exists() || docSnap.data()?.status === "deleted" || docSnap.data()?.isDeleted) {
                    import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
                      clearAuthSession("/login?error=account_deleted");
                    });
                    return;
                  }
                  if (docSnap.exists()) {
                    const s = docSnap.data();
                    if (s.status === "restricted") {
                      import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
                        clearAuthSession("/login?error=restricted");
                      });
                      return;
                    }
                    const updated = {
                      ...parsedUser,
                      name: s.name || parsedUser.name,
                      email: s.email || parsedUser.email,
                      department: s.department || parsedUser.department,
                      collegeId: s.collegeId || parsedUser.collegeId,
                      academicYear: s.academicYear || parsedUser.academicYear,
                      section: s.section || parsedUser.section,
                      batchIds: s.batchIds || parsedUser.batchIds,
                    };
                    commitIfChanged(updated, [
                      "name",
                      "email",
                      "department",
                      "collegeId",
                      "academicYear",
                      "section",
                      "batchIds",
                    ]);
                  }
                } catch (e) {
                  console.error("Profile sync error", e);
                }
              });
            });
          } else {
            import("firebase/firestore").then(({ doc, getDoc }) => {
              import("@/lib/firebase/config").then(async ({ db }) => {
                try {
                  const docSnap = await getDoc(doc(db, "users", parsedUser.id));
                  if (!docSnap.exists()) {
                    import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
                      clearAuthSession("/login?error=account_deleted");
                    });
                    return;
                  }
                  if (docSnap.exists()) {
                    const u = docSnap.data();
                    const updated = {
                      ...parsedUser,
                      name: u.displayName || parsedUser.name,
                      email: u.email || parsedUser.email,
                      collegeId: u.collegeId || parsedUser.collegeId,
                    };
                    commitIfChanged(updated, ["name", "email", "collegeId"]);
                  }
                } catch (e) {
                  console.error("User sync error", e);
                }
              });
            });
          }

          const unsubLMS = subscribeToLMSCache(() => {});
          syncUnsubs.push(unsubLMS);
          unsubs.push(unsubLMS);
        });
        unsubs.push(() => {
          if (authUnsub) authUnsub();
        });
      });
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []); // Run once on mount only

  if (isLoggingOut) {
    return (
      <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-background text-foreground font-sans">
        <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-muted-foreground animate-pulse">Signing out securely...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-[100dvh] flex relative bg-transparent overflow-x-hidden">
        <NavigationProgress />
        {/* Background removed to fix performance issues on lower end devices */}

        {/* Sidebar - desktop */}
        <Sidebar />

        {/* Mobile sidebar */}
        <MobileSidebar />

        {/* Main content area */}
        <div
          className={cn(
            "flex-1 flex flex-col min-h-[100dvh] relative z-10 min-w-0 w-full",
            isExpanded ? "lg:ml-[260px]" : "lg:ml-[80px]"
          )}
          style={{
            transition: 'margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'margin-left'
          }}
        >
          <Topbar />
          <main className="flex-1 p-4 sm:p-7 lg:p-9 lg:pb-16 pb-20 max-w-[100vw] lg:max-w-[1600px] w-full mx-auto min-w-0">
            {children}
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
