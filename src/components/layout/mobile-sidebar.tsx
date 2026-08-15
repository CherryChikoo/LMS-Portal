"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LogOut,
  Settings,
  LayoutDashboard,
  ClipboardList,
  Trophy,
  Medal,
  FolderOpen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { NAVIGATION, APP_NAME } from "@/lib/constants";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBranding } from "@/providers/branding-provider";
import { logoutUser } from "@/lib/services/auth-service";
import { useMounted } from "@/hooks/use-mounted";

export function MobileSidebar() {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile } = useSidebar();
  const mounted = useMounted();
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
  const { branding, loading } = useBranding();

  useEffect(() => {
    try {
      const role = localStorage.getItem("lms_role") || localStorage.getItem("role");
      let parsed = null;
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) parsed = JSON.parse(uStr);
      
      if (role) {
        setUserRole(role.toLowerCase());
      } else if (parsed && parsed.role) {
        setUserRole(parsed.role.toLowerCase());
      }

      if (parsed) {
        setUserCollegeId(parsed.collegeId || null);
        setUserCollegeName(parsed.collegeName || null);
      }
    } catch {
      setUserRole("student");
    }
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
      closeMobile();
    } catch {}
  };

  const isExamTakeRoute =
    pathname !== null && /^\/(student|admin)\/exams\/[^/]+\/(take|review)(\/|$)/.test(pathname);


  const effectiveNav = useMemo(() => {
    if (!userRole) return [];
    const isStudent = userRole === "student";
    const isCollegeAdmin = userRole === "college_admin";

    let base = isStudent
      ? [
          {
            title: "Academic Portal",
            items: [{ title: "My Dashboard", href: "/", icon: LayoutDashboard }],
          },
          {
            title: "Examinations",
            items: [
              { title: "Assigned Tests", href: "/exams", icon: ClipboardList },
              { title: "My Test Results", href: "/results", icon: Trophy },
              { title: "Leaderboard", href: "/leaderboard", icon: Medal },
            ],
          },
          {
            title: "Study Resources",
            items: [{ title: "Course Material", href: "/resources", icon: FolderOpen }],
          },
        ]
      : NAVIGATION;

    if (isCollegeAdmin) {
      base = base
        .map((sec) => ({
          ...sec,
          items: sec.items.filter((it) => it.href !== "/colleges" && it.href !== "/audit"),
        }))
        .filter((sec) => sec.items.length > 0);
    }

    const prefix = isStudent ? "/student" : "/admin";
    return base.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => ({
        ...it,
        href:
          it.href === "/" && isCollegeAdmin
            ? "/"
            : it.href === "/"
            ? prefix
            : `${prefix}${it.href}`,
      })),
    }));
  }, [userRole]);

  if (isExamTakeRoute) {
    return null;
  }

  return (
    <Sheet open={isMobileOpen} onOpenChange={closeMobile}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[280px] sm:w-[320px] p-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-border shadow-2xl"
        style={{ fontFamily: '"Montserrat", sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-20 px-5 shrink-0 border-b border-border/40">
          <Link href="/" className="flex items-center gap-3 overflow-hidden" onClick={closeMobile}>
            {userRole === "college_admin" ? (
              <div className="w-9 h-9 rounded-xl bg-brand/15 text-brand flex items-center justify-center font-black text-base shrink-0 border border-brand/30 shadow-sm">
                {(userCollegeName || "C").charAt(0).toUpperCase()}
              </div>
            ) : branding.logoBase64 ? (
              <img
                src={branding.logoBase64}
                alt="Logo"
                className="w-8 h-8 object-contain rounded-lg shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-black text-base shrink-0 border border-brand/20">
                {(branding.companyName || "C").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              {userRole === "college_admin" ? (
                <>
                  <span className="font-bold text-base text-brand tracking-tight truncate">
                    {userCollegeName || "College Portal"}
                  </span>
                  <span className="text-[10px] font-bold text-brand/60 uppercase tracking-widest truncate">
                    College Admin Portal
                  </span>
                </>
              ) : (
                <>
                  <span className="font-bold text-base text-brand tracking-tight truncate">
                    {branding.companyName || "Enterprise LMS"}
                  </span>
                  <span className="text-[10px] font-bold text-brand/60 uppercase tracking-widest truncate">
                    {branding.companySubtitle || "Master Admin"}
                  </span>
                </>
              )}
            </div>
          </Link>
          <button
            onClick={closeMobile}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 transition-all"
            aria-label="Close Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Nav List */}
        <ScrollArea className="flex-1 px-4 py-4 min-h-0">
          <nav className="space-y-6 pb-8">
            {effectiveNav.map((section) => (
              <div key={section.title}>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/admin" && item.href !== "/student" && pathname.startsWith(item.href + "/"));
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeMobile}
                        className={cn(
                          "flex items-center gap-3.5 px-3.5 h-12 rounded-xl text-sm font-medium transition-all active:scale-[0.98]",
                          isActive
                            ? "bg-brand text-black font-bold shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                        )}
                      >
                        <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-black" : "text-muted-foreground")} />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Footer Items inside scroll */}
            <div className="pt-4 border-t border-border/40 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3">
                SETTINGS
              </p>

              <Link
                href={userRole === "student" ? "/student/settings" : "/admin/settings"}
                onClick={closeMobile}
                className="flex items-center gap-3.5 px-3.5 h-12 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-[0.98] transition-all"
              >
                <Settings className="w-5 h-5 shrink-0 text-muted-foreground" />
                <span>Settings</span>
              </Link>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3.5 px-3.5 h-12 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition-all text-left"
              >
                <LogOut className="w-5 h-5 shrink-0 text-rose-500" />
                <span>Logout</span>
              </button>
            </div>
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
