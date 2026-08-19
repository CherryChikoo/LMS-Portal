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
import { useGlobalLoading } from "@/providers/global-loading-provider";

export function Sidebar() {
  const pathname = usePathname();
  const { isExpanded } = useSidebar();
  const { branding, loading } = useBranding();
  const { isLoading: isGlobalLoading } = useGlobalLoading();
  const mounted = useMounted();
  const [showBrandModal, setShowBrandModal] = useState(false);
  // Fix hydration: Don't read localStorage during initial render
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userCollegeId, setUserCollegeId] = useState<string | null>(null);
  const [userCollegeName, setUserCollegeName] = useState<string | null>(null);

  const refreshUser = () => {
    if (typeof window === "undefined") return;
    try {
      const role = localStorage.getItem("lms_role") || localStorage.getItem("role");
      let parsed = null;
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) parsed = JSON.parse(uStr);
      
      console.log('[SIDEBAR] refreshUser - role from localStorage:', role, 'parsed.role:', parsed?.role);
      
      if (role) {
        setUserRole(role.toLowerCase());
        console.log('[SIDEBAR] Set userRole from lms_role:', role.toLowerCase());
      } else if (parsed && parsed.role) {
        setUserRole(parsed.role.toLowerCase());
        console.log('[SIDEBAR] Set userRole from parsed:', parsed.role.toLowerCase());
      } else {
        setUserRole("student");
        console.log('[SIDEBAR] Defaulting to student role');
      }

      if (parsed) {
        setUserCollegeId(parsed.collegeId || null);
        setUserCollegeName(parsed.collegeName || null);
      }
    } catch (err) {
      console.error('[SIDEBAR] Error in refreshUser:', err);
      setUserRole("student");
    }
  };

  // Load user data only on mount (client-side only)
  useEffect(() => {
    refreshUser();
    
    const handleStorageChange = () => refreshUser();
    const handleBrandingUpdate = () => refreshUser();
    
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("lms_branding_updated", handleBrandingUpdate);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("lms_branding_updated", handleBrandingUpdate);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {}
  };

  const effectiveNav = useMemo(() => {
    // During SSR or before userRole loads, return empty to prevent hydration mismatch
    if (!mounted || !userRole) return [];
    
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
  }, [userRole, mounted]);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 bg-sidebar text-sidebar-foreground border-r border-border overflow-hidden transition-all duration-300",
        isExpanded ? "w-[260px]" : "w-[80px]",
        isGlobalLoading && "pointer-events-none opacity-40 select-none cursor-not-allowed"
      )}
      style={{ 
        fontFamily: '"Montserrat", sans-serif',
        transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'width'
      }}
    >
      {/* Loading Blocker Overlay */}
      {isGlobalLoading && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-50 bg-background/50 backdrop-blur-[1px] cursor-not-allowed pointer-events-auto"
        />
      )}

      {/* Brand Header */}
      <div className="flex items-center h-20 px-4 shrink-0 relative group/brand overflow-hidden">
        <Link href="/" className="flex items-center w-full min-w-0">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            {!mounted ? (
              <div className="w-9 h-9 rounded-xl bg-brand/10 animate-pulse shrink-0" />
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
            {!mounted ? (
               <div className="flex flex-col gap-1.5 w-32 py-1">
                 <div className="h-4 bg-brand/10 rounded animate-pulse w-full" />
                 <div className="h-2 bg-brand/10 rounded animate-pulse w-2/3" />
               </div>
            ) : (
              <>
                <span className="font-bold text-base text-brand tracking-tight truncate">
                  {branding.companyName || "Masters Academy"}
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
          {!mounted || effectiveNav.length === 0 ? (
            // Show skeleton during SSR and initial load
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-20 bg-muted/30 rounded animate-pulse mb-2 mx-3" />
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-11 bg-muted/20 rounded-xl mx-2 animate-pulse" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            effectiveNav.map((section) => (
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

                  return isExpanded ? (
                    <div key={item.href}>{content}</div>
                  ) : (
                    <Tooltip key={item.href}>
                      <TooltipTrigger render={content} />
                      <TooltipContent side="right" sideOffset={12} className="glass-popover font-medium">
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))
          )}
        </nav>
      </ScrollArea>

      {/* Footer Settings & Logout */}
      <div className="shrink-0 pt-2 border-t border-border/40 px-3 pb-4 space-y-1">
        {isExpanded ? (
          <Link
            href={userRole === "student" ? "/student/settings" : "/admin/settings"}
            className="group flex items-center h-11 rounded-xl text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/80 overflow-hidden px-3 gap-3"
          >
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
            </div>
            <span
              className="truncate text-sm min-w-0 flex-1 opacity-100"
              style={{
                transform: 'translateX(0)',
                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              Settings
            </span>
          </Link>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={userRole === "student" ? "/student/settings" : "/admin/settings"}
                  className="group flex items-center h-11 rounded-xl text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/80 overflow-hidden justify-center px-0 w-11 mx-auto"
                >
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    <Settings className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <span
                    className="truncate text-sm min-w-0 flex-1 opacity-0 pointer-events-none absolute"
                    style={{
                      transform: 'translateX(-12px)',
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
        )}

        {isExpanded ? (
          <button
            onClick={handleLogout}
            className="w-full group flex items-center h-11 rounded-xl text-sm font-medium transition-colors text-rose-500 hover:bg-rose-500/10 overflow-hidden px-3 gap-3"
          >
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 text-rose-500" />
            </div>
            <span
              className="truncate text-sm font-semibold min-w-0 flex-1 text-left opacity-100"
              style={{
                transform: 'translateX(0)',
                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              Logout
            </span>
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={handleLogout}
                  className="w-full group flex items-center h-11 rounded-xl text-sm font-medium transition-colors text-rose-500 hover:bg-rose-500/10 overflow-hidden justify-center px-0 w-11 mx-auto"
                >
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    <LogOut className="w-5 h-5 text-rose-500" />
                  </div>
                  <span
                    className="truncate text-sm font-semibold min-w-0 flex-1 text-left opacity-0 pointer-events-none absolute"
                    style={{
                      transform: 'translateX(-12px)',
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
        )}
      </div>

      <BrandingModal isOpen={showBrandModal} onClose={() => setShowBrandModal(false)} />
    </aside>
  );
}
