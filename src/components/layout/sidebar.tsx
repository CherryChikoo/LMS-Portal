"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Settings,
  LayoutDashboard,
  ClipboardList,
  Trophy,
  Medal,
  FolderOpen,
  Pencil,
  Upload,
  X,
  Check,
  Building2,
  BookOpen,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { useIsDesktop } from "@/hooks/use-media-query";
import { NAVIGATION, APP_NAME } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { logoutUser } from "@/lib/services/auth-service";
import { useBranding } from "@/providers/branding-provider";
import { BrandingModal } from "@/components/shared/branding-modal";

export function Sidebar() {
  const pathname = usePathname();
  const { isExpanded, toggle } = useSidebar();
  const isDesktop = useIsDesktop();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const role = localStorage.getItem("lms_role");
      setUserRole(role ? role.toLowerCase() : null);
    } catch {
      // ignore
    }
  }, []);

  const { branding } = useBranding();
  const [showBrandModal, setShowBrandModal] = useState(false);

  useEffect(() => {
    const checkRole = () => {
      try {
        const role = localStorage.getItem("lms_role");
        setUserRole(role ? role.toLowerCase() : null);
      } catch {
        setUserRole(null);
      }
    };
    checkRole();
    window.addEventListener("storage", checkRole);
    return () => window.removeEventListener("storage", checkRole);
  }, []);

  const handleLogout = async () => {
    try { await logoutUser(); } catch {}
  };

  const handleOpenBrandModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowBrandModal(true);
  };

  const effectiveNav = useMemo(() => {
    if (!userRole) return [];
    const base = userRole === "student" ? [
      {
        title: "Academic Portal",
        items: [
          { title: "My Dashboard", href: "/", icon: LayoutDashboard },
        ]
      },
      {
        title: "Examinations",
        items: [
          { title: "Assigned Tests", href: "/exams", icon: ClipboardList },
          { title: "My Test Results", href: "/results", icon: Trophy },
          { title: "Leaderboard", href: "/leaderboard", icon: Medal },
        ]
      },
      {
        title: "Study Resources",
        items: [
          { title: "Course Material", href: "/resources", icon: FolderOpen },
        ]
      }
    ] : NAVIGATION;

    let filteredBase = base;
    if (userRole === "college_admin") {
      filteredBase = base.map(sec => ({
        ...sec,
        items: sec.items.filter(it => it.href !== "/colleges" && it.href !== "/audit")
      })).filter(sec => sec.items.length > 0);
    }

    const prefix = userRole === "student" ? "/student" : "/admin";
    return filteredBase.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => ({
        ...it,
        href: it.href === "/" && userRole === "college_admin" ? "/" : it.href === "/" ? prefix : `${prefix}${it.href}`,
      })),
    }));
  }, [userRole]);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 bg-sidebar text-sidebar-foreground border-r border-border",
        isExpanded ? "w-[260px]" : "w-[80px]"
      )}
      style={{ fontFamily: '"Montserrat", sans-serif' }}
    >
      {/* Logo & Top Collapse Toggle Area */}
      <div className={cn("flex items-center h-20 px-4 shrink-0 relative group/brand overflow-hidden")}>
        <Link href="/" className={cn("flex items-center flex-1 min-w-0 mr-1 overflow-hidden", isExpanded ? "gap-2.5" : "gap-0")}>
          {branding.logoBase64 ? (
            <img
              src={branding.logoBase64}
              alt="Company Logo"
              className={cn("object-contain rounded-lg shrink-0", isExpanded ? "w-8 h-8" : "w-7 h-7 mx-auto")}
            />
          ) : (
            <div className={cn("rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0 font-black text-lg", isExpanded ? "w-8 h-8" : "w-7 h-7 mx-auto")}>
              {(branding.companyName || APP_NAME).charAt(0).toUpperCase()}
            </div>
          )}
          <div
            className={cn(
              "flex flex-col min-w-0 overflow-hidden whitespace-nowrap transition-opacity duration-300 ease-in-out",
              isExpanded ? "w-[160px] opacity-100 ml-2" : "w-0 opacity-0 ml-0"
            )}
          >
            <span className="font-bold text-lg text-brand tracking-tight truncate flex items-center gap-2">
              {branding.companyName || APP_NAME}
            </span>
            <span className="text-[9px] font-bold text-brand/60 uppercase tracking-widest truncate">
              {branding.companySubtitle || (userRole === "student" ? "Student Portal" : "Enterprise")}
            </span>
          </div>
        </Link>

        {userRole && userRole !== "student" && (
          <button
            type="button"
            onClick={handleOpenBrandModal}
            title="Edit Company Branding & Logo"
            className={cn(
              "opacity-0 group-hover/brand:opacity-100 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground shrink-0 transition-opacity duration-300 ease-in-out mr-1",
              isExpanded ? "pointer-events-auto" : "pointer-events-none w-0 p-0 overflow-hidden"
            )}
          >
            <Pencil className="w-3.5 h-3.5 text-brand" />
          </button>
        )}
      </div>

      {/* Navigation Links & Settings Inside ScrollArea with pb-12 so nothing is ever obscured by OS taskbar */}
      <ScrollArea className="flex-1 min-h-0 px-3 py-3 pb-2">
        <nav className="space-y-5 pb-4">
          {effectiveNav.map((section) => (
            <div key={section.title}>
              <div
                className={cn(
                  "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
                  isExpanded ? "max-h-10 opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3.5 mt-2">
                  {section.title}
                </p>
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/admin" && item.href !== "/student" && pathname.startsWith(item.href + "/"));
                  const Icon = item.icon;

                  const linkContent = (
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center px-3.5 h-11 rounded-lg text-sm font-medium transition-colors overflow-hidden",
                        isActive
                          ? "bg-brand text-black shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                        isExpanded ? "gap-5" : "gap-0 justify-center px-0 w-11 mx-auto"
                      )}
                    >
                      <Icon
                        className={cn(
                          "shrink-0 transition-transform duration-200 group-hover:scale-110",
                          isActive ? "text-black w-5 h-5" : "text-muted-foreground group-hover:text-foreground w-5 h-5"
                        )}
                      />
                      <span
                        className={cn(
                          "whitespace-nowrap overflow-hidden flex items-center transition-opacity duration-300 ease-in-out",
                          isExpanded ? "w-[160px] opacity-100" : "w-0 opacity-0"
                        )}
                      >
                        {item.title}
                        {item.badge && (
                          <span className="ml-auto text-[11px] bg-brand/20 text-brand px-2 py-0.5 rounded-full font-semibold border border-brand/30 shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </span>
                    </Link>
                  );

                  return (
                    <Tooltip key={item.href} disabled={isExpanded}>
                      <TooltipTrigger render={linkContent} />
                      <TooltipContent side="right" sideOffset={14} className="glass-popover border-white/10 font-medium">
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

      {/* Settings Footer (Fixed at bottom) */}
      <div className="shrink-0 pt-3 mt-auto border-t border-border/40 px-3 pb-4 space-y-1">
        <div
          className={cn(
            "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
            isExpanded ? "max-h-10 opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3.5 mt-2">
            SETTINGS
          </p>
        </div>

        <Tooltip disabled={isExpanded}>
          <TooltipTrigger
            render={
              <Link
                href={userRole === "student" ? "/student/settings" : "/admin/settings"}
                className={cn(
                  "group relative flex items-center px-3.5 h-11 rounded-lg text-sm font-medium transition-colors overflow-hidden",
                  "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  isExpanded ? "gap-5" : "gap-0 justify-center px-0 w-11 mx-auto"
                )}
              >
                <Settings className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span
                  className={cn(
                    "whitespace-nowrap overflow-hidden flex items-center transition-opacity duration-300 ease-in-out",
                    isExpanded ? "w-[160px] opacity-100" : "w-0 opacity-0"
                  )}
                >
                  Settings
                </span>
              </Link>
            }
          />
          <TooltipContent side="right" sideOffset={14} className="glass-popover font-heading">
            Settings
          </TooltipContent>
        </Tooltip>

        <Tooltip disabled={isExpanded}>
          <TooltipTrigger
            render={
              <button
                onClick={handleLogout}
                className={cn(
                  "w-full group relative flex items-center h-11 rounded-lg text-sm font-medium transition-colors overflow-hidden mt-1",
                  "text-rose-500 hover:bg-rose-500/10",
                  isExpanded ? "gap-5 px-3.5" : "gap-0 justify-center px-0 w-11 mx-auto"
                )}
              >
                <LogOut className="w-5 h-5 shrink-0 text-rose-500" />
                <span
                  className={cn(
                    "whitespace-nowrap overflow-hidden flex items-center text-left transition-opacity duration-300 ease-in-out",
                    isExpanded ? "w-[160px] opacity-100" : "w-0 opacity-0"
                  )}
                >
                  Logout
                </span>
              </button>
            }
          />
          <TooltipContent side="right" sideOffset={14} className="glass-popover font-heading text-rose-500">
            Logout
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Edit Company Branding Modal */}
      <BrandingModal
        isOpen={showBrandModal}
        onClose={() => setShowBrandModal(false)}
      />
    </aside>
  );
}
