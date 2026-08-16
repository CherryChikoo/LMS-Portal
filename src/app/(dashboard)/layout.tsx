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
import { getStudentByIdAction, getUserByIdAction } from "@/lib/actions/auth-actions";
import { ErrorBoundary } from "@/components/error-boundary";
import { NAVIGATION } from "@/lib/constants";
import { useBranding } from "@/providers/branding-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded } = useSidebar();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Used to throttle the storage event dispatch to at most once per 2 seconds.
  const lastDispatchRef = useRef<number>(0);
  const { branding } = useBranding();

  const pathname = usePathname();

  // Dynamic Document Title based on current route
  useEffect(() => {
    if (typeof document === "undefined") return;
    let pageTitle = "Dashboard";
    const path = pathname || "";
    
    if (path !== "/" && path !== "/admin" && path !== "/student" && path !== "/college") {
      for (const section of NAVIGATION) {
        for (const item of section.items) {
          if (path.includes(item.href) && item.href !== "/") {
            pageTitle = item.title;
            break;
          }
        }
      }
    }
    const companyName = branding.companyName || "Masters Academy";
    document.title = `${pageTitle} | ${companyName}`;
  }, [pathname, branding.companyName]);

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
    let isCancelled = false;

    const verifyAuth = async () => {
      if (typeof window !== "undefined" && (window as any).__isLoggingOut) {
        return;
      }

      let uStr = typeof window !== "undefined" ? (localStorage.getItem("lms_user") || localStorage.getItem("user")) : null;
      if (!uStr) {
        try {
          const { supabase } = await import("@/lib/supabase/client");
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            const user = data.session.user;
            const email = user.email?.toLowerCase().trim() || "";
            const { getUserByIdAction, getStudentByIdAction } = await import("@/lib/actions/auth-actions");
            let dbUser = await getUserByIdAction(user.id);
            if (!dbUser && email) {
              dbUser = await getUserByIdAction(email);
            }
            let studentDoc = null;
            if (!dbUser || dbUser.role === "student") {
              studentDoc = (await getStudentByIdAction(user.id)) || (await getStudentByIdAction(email));
            }

            const role = dbUser?.role || "student";
            const uObj = {
              id: studentDoc?.id || dbUser?.id || user.id,
              authId: user.id,
              name: dbUser?.displayName || user.user_metadata?.full_name || email.split("@")[0] || "User",
              email: email,
              role: role,
              collegeId: studentDoc?.collegeId || dbUser?.collegeId || null,
              createdAt: Date.now(),
            };
            const { setAuthSession } = await import("@/lib/utils/auth-session");
            await setAuthSession(uObj, role);
            uStr = JSON.stringify(uObj);
          }
        } catch (_) {}
      }

      if (isCancelled) return;

      const hasAuthCookie = typeof document !== "undefined" && (document.cookie.includes("lms_auth=true") || document.cookie.includes("lms_role=") || document.cookie.includes("lms_token="));
      const hasLocalStorageAuth = typeof localStorage !== "undefined" && Boolean(localStorage.getItem("lms_user") || localStorage.getItem("user") || localStorage.getItem("lms_role") || localStorage.getItem("lms_auth"));
      if (!uStr && !hasLocalStorageAuth && !hasAuthCookie) {
        try {
          const { supabase } = await import("@/lib/supabase/client");
          const { data } = await supabase.auth.getSession();
          if (!data?.session?.user) {
            window.location.replace("/login");
          }
        } catch {
          // Network fluctuation, avoid logging user out
        }
      } else if (uStr) {
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
    return () => {
      isCancelled = true;
    };
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

    let isMounted = true;
    let authUnsub: (() => void) | null = null;
    let syncUnsubs: (() => void)[] = [];

    // Safely delay background profile sync so Next.js client router fully mounts first
    const initTimer = setTimeout(() => {
      if (!isMounted) return;

      import("@/lib/supabase/client").then(({ supabase }) => {
        if (!isMounted) return;

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
          if (!isMounted) return;
          const user = session?.user;
          syncUnsubs.forEach((u) => u());
          syncUnsubs = [];

          if (!user) return;

          setTimeout(async () => {
            if (!isMounted) return;

            if (parsedUser.role === "student") {
              try {
                let docSnap = await getStudentByIdAction(parsedUser.id);
                if (!docSnap && user.id) {
                  docSnap = await getStudentByIdAction(user.id);
                }
                if (!docSnap && user.email) {
                  docSnap = await getStudentByIdAction(user.email);
                }

                if (!isMounted) return;
                if (!docSnap) {
                  return;
                }

                const s = docSnap as any;
                const userStatus = s.users?.status || s.status;
                if (userStatus === "restricted") {
                  import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
                    clearAuthSession("/login?error=restricted");
                  });
                  return;
                }
                if (userStatus === "deleted") {
                  import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
                    clearAuthSession("/login?error=account_deleted");
                  });
                  return;
                }
                const updated = {
                  ...parsedUser,
                  name: s.users?.displayName || s.name || parsedUser.name,
                  email: s.users?.email || s.email || parsedUser.email,
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
              } catch (e) {
                console.error("Profile sync error", e);
              }
            } else {
              try {
                let docSnap = await getUserByIdAction(parsedUser.id);
                if (!docSnap && user.id) {
                  docSnap = await getUserByIdAction(user.id);
                }
                if (!docSnap && user.email) {
                  docSnap = await getUserByIdAction(user.email);
                }

                if (!isMounted) return;
                if (!docSnap) {
                  return;
                }

                const u = docSnap as any;
                const colStatus = u.colleges?.status;
                if (u.status === "restricted" || (colStatus === "restricted" && (u.role === "college_admin" || u.role === "college"))) {
                  import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
                    clearAuthSession("/login?error=restricted");
                  });
                  return;
                }
                if (u.status === "deleted") {
                  import("@/lib/utils/auth-session").then(({ clearAuthSession }) => {
                    clearAuthSession("/login?error=account_deleted");
                  });
                  return;
                }
                const updated = {
                  ...parsedUser,
                  name: u.displayName || parsedUser.name,
                  email: u.email || parsedUser.email,
                  collegeId: u.collegeId || parsedUser.collegeId,
                };
                commitIfChanged(updated, ["name", "email", "collegeId"]);
              } catch (e) {
                console.error("User sync error", e);
              }
            }
          }, 100);

          const unsubLMS = subscribeToLMSCache(() => {});
          syncUnsubs.push(unsubLMS);
          unsubs.push(unsubLMS);
        });
        authUnsub = () => authListener.subscription.unsubscribe();
        unsubs.push(() => {
          if (authUnsub) authUnsub();
        });
      });
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
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
