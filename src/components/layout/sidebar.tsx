"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  Settings,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Trophy,
  Medal,
  FolderOpen,
  Pencil,
} from "lucide-react";
import { cn, formatDisplayName } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { NAVIGATION, APP_NAME } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMounted } from "@/hooks/use-mounted";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logoutUser } from "@/lib/services/auth-service";
import { useBranding } from "@/providers/branding-provider";
import { BrandingModal } from "@/components/shared/branding-modal";

export function Sidebar() {
  const pathname = usePathname();
  const { isExpanded } = useSidebar();
  const { branding, loading } = useBranding();
  const mounted = useMounted();
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userCollegeId, setUserCollegeId] = useState<string | null>(null);
  const [userCollegeName, setUserCollegeName] = useState<string | null>(null);

  const refreshUser = () => {
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
  };

  useEffect(() => {
    refreshUser();
    window.addEventListener("storage", refreshUser);
    window.addEventListener("lms_branding_updated", refreshUser);
    return () => {
      window.removeEventListener("storage", refreshUser);
      window.removeEventListener("lms_branding_updated", refreshUser);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {}
  };

  const effectiveNav = useMemo(() => {
    if (!userRole) return [];
    const isStudent = userRole === "student";
    const isCollegeAdmin = userRole === "college_admin";

    const base = isStudent
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

    let filteredBase = base;
    if (isCollegeAdmin) {
      filteredBase = base
        .map((sec) => ({
          ...sec,
          items: sec.items.filter((it) => it.href !== "/colleges" && it.href !== "/audit"),
        }))
        .filter((sec) => sec.items.length > 0);
    }

    const prefix = isStudent ? "/student" : "/admin";
    return filteredBase.map((sec) => ({
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

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 bg-sidebar text-sidebar-foreground border-r border-border overflow-hidden",
        isExpanded ? "w-[260px]" : "w-[80px]"
      )}
      style={{ 
        fontFamily: '"Montserrat", sans-serif',
        transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'width'
      }}
    >
      {/* Brand Header */}
      <div className="flex items-center h-20 px-4 shrink-0 relative group/brand overflow-hidden">
        <Link href="/" className="flex items-center w-full min-w-0">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            {!mounted || loading ? (
              <div className="w-9 h-9 rounded-xl bg-brand/10 animate-pulse border border-brand/20 shrink-0" />
            ) : userRole === "college_admin" ? (
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
          </div>
          <div
            className={cn(
              "flex flex-col min-w-0 pl-2 transition-opacity duration-300 ease-out",
              isExpanded ? "opacity-100" : "opacity-0 pointer-events-none absolute"
            )}
            style={{
              transform: isExpanded ? 'translateX(0)' : 'translateX(-12px)',
              transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {!mounted || loading ? (
              <div className="space-y-1.5 py-1">
                <div className="h-4 w-32 bg-brand/10 animate-pulse rounded-md" />
                <div className="h-2.5 w-20 bg-brand/10 animate-pulse rounded-md" />
              </div>
            ) : userRole === "college_admin" ? (
              <>
                <span className="font-bold text-base text-brand tracking-tight truncate">
                  {formatDisplayName(userCollegeName || "College Portal")}
                </span>
                <span className="text-[9px] font-bold text-brand/60 uppercase tracking-widest truncate">
                  College Admin Portal
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-base text-brand tracking-tight truncate">
                  {branding.companyName || "Enterprise LMS"}
                </span>
                <span className="text-[9px] font-bold text-brand/60 uppercase tracking-widest truncate">
                  {branding.companySubtitle || "Master Admin"}
                </span>
              </>
            )}
          </div>
        </Link>

        {mounted && userRole && userRole !== "student" && isExpanded && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowBrandModal(true);
            }}
            title="Edit Company Branding"
            className="opacity-0 group-hover/brand:opacity-100 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground shrink-0 transition-opacity duration-200 ml-auto"
          >
            <Pencil className="w-3.5 h-3.5 text-brand" />
          </button>
        )}
      </div>

      {/* Nav List */}
      <ScrollArea className="flex-1 px-3 py-2 min-h-0">
        <nav className="space-y-6 pb-6">
          {effectiveNav.map((section) => (
            <div key={section.title}>
              {isExpanded && (
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3 mt-1 truncate">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/admin" && item.href !== "/student" && pathname.startsWith(item.href + "/"));
                  const Icon = item.icon;

                  const content = (
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center h-11 rounded-xl text-sm font-medium transition-colors overflow-hidden",
                        isActive
                          ? "bg-brand text-black shadow-sm font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/80",
                        isExpanded ? "px-3 gap-3" : "justify-center px-0 w-11 mx-auto"
                      )}
                      style={{ willChange: 'background-color, color' }}
                    >
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <Icon className={cn("w-5 h-5 shrink-0", isActive ? "text-black" : "text-muted-foreground group-hover:text-foreground")} />
                      </div>
                      <span
                        className={cn(
                          "truncate text-sm min-w-0 flex-1",
                          isExpanded ? "opacity-100" : "opacity-0 pointer-events-none absolute"
                        )}
                        style={{
                          transform: isExpanded ? 'translateX(0)' : 'translateX(-12px)',
                          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        {item.title}
                      </span>
                    </Link>
                  );

                  return (
                    <Tooltip key={item.href} disabled={isExpanded}>
                      <TooltipTrigger render={content} />
                      <TooltipContent side="right" sideOffset={12} className="glass-popover font-medium">
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer Settings & Logout */}
      <div className="shrink-0 pt-2 border-t border-border/40 px-3 pb-4 space-y-1">
        <Tooltip disabled={isExpanded}>
          <TooltipTrigger
            render={
              <Link
                href={userRole === "student" ? "/student/settings" : "/admin/settings"}
                className={cn(
                  "group flex items-center h-11 rounded-xl text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/80 overflow-hidden",
                  isExpanded ? "px-3 gap-3" : "justify-center px-0 w-11 mx-auto"
                )}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <Settings className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <span
                  className={cn(
                    "truncate text-sm min-w-0 flex-1",
                    isExpanded ? "opacity-100" : "opacity-0 pointer-events-none absolute"
                  )}
                  style={{
                    transform: isExpanded ? 'translateX(0)' : 'translateX(-12px)',
                    transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  Settings
                </span>
              </Link>
            }
          />
          <TooltipContent side="right" sideOffset={12} className="glass-popover font-medium">
            Settings
          </TooltipContent>
        </Tooltip>

        <Tooltip disabled={isExpanded}>
          <TooltipTrigger
            render={
              <button
                onClick={handleLogout}
                className={cn(
                  "w-full group flex items-center h-11 rounded-xl text-sm font-medium transition-colors text-rose-500 hover:bg-rose-500/10 overflow-hidden",
                  isExpanded ? "px-3 gap-3" : "justify-center px-0 w-11 mx-auto"
                )}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <LogOut className="w-5 h-5 text-rose-500" />
                </div>
                <span
                  className={cn(
                    "truncate text-sm font-semibold min-w-0 flex-1 text-left",
                    isExpanded ? "opacity-100" : "opacity-0 pointer-events-none absolute"
                  )}
                  style={{
                    transform: isExpanded ? 'translateX(0)' : 'translateX(-12px)',
                    transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  Logout
                </span>
              </button>
            }
          />
          <TooltipContent side="right" sideOffset={12} className="glass-popover text-rose-500 font-medium">
            Logout
          </TooltipContent>
        </Tooltip>
      </div>

      <BrandingModal isOpen={showBrandModal} onClose={() => setShowBrandModal(false)} />
    </aside>
  );
}
