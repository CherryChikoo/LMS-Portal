"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useMemo } from "react";
import {
  PanelLeftClose,
  PanelLeft,
  LogOut,
  GraduationCap,
  Settings,
  LayoutDashboard,
  ClipboardList,
  Trophy,
  FolderOpen,
  HelpCircle,
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
import { auth } from "@/lib/firebase/config";
import { signOut } from "firebase/auth";
import { clearAuthSession } from "@/lib/utils/auth-session";

export function Sidebar() {
  const pathname = usePathname();
  const { isExpanded, toggle } = useSidebar();
  const isDesktop = useIsDesktop();
  const [userRole, setUserRole] = useState<string>("admin");

  useEffect(() => {
    const checkRole = () => {
      try {
        const role = localStorage.getItem("lms_role") || "admin";
        setUserRole(role.toLowerCase());
      } catch (_) {}
    };
    checkRole();
    window.addEventListener("storage", checkRole);
    return () => window.removeEventListener("storage", checkRole);
  }, []);

  const handleLogout = async () => {
    try { await signOut(auth); } catch {}
    clearAuthSession();
  };

  const effectiveNav = useMemo(() => {
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
        ]
      },
      {
        title: "Study Resources",
        items: [
          { title: "Course Material", href: "/resources", icon: FolderOpen },
        ]
      }
    ] : NAVIGATION;

    const prefix = userRole === "student" ? "/student" : "/admin";
    return base.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => ({
        ...it,
        href: it.href === "/" ? prefix : `${prefix}${it.href}`,
      })),
    }));
  }, [userRole]);

  if (!isDesktop) return null;

  return (
    <motion.aside
      initial={false}
      animate={{ width: isExpanded ? 260 : 80 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="fixed left-0 top-0 bottom-0 z-30 flex flex-col bg-sidebar backdrop-blur-2xl text-sidebar-foreground transition-all duration-300 border-r border-border/40"
    >
      {/* Logo & Top Collapse Toggle Area */}
      <div className={cn("flex items-center h-20 px-4 shrink-0 border-b border-border/30", isExpanded ? "justify-between" : "justify-center")}>
        {isExpanded && (
          <Link href="/" className="flex items-center gap-3 group overflow-hidden">
            <div className="flex flex-col">
              <span className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 tracking-tight whitespace-nowrap">
                {APP_NAME}
              </span>
              <span className="text-[10px] font-medium text-emerald-500 uppercase tracking-widest whitespace-nowrap">
                {userRole === "student" ? "Student Portal" : "Enterprise v2.4"}
              </span>
            </div>
          </Link>
        )}

        {/* Top Header Collapse Toggle Button */}
        <button
          onClick={toggle}
          title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          className="p-2 rounded-lg hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center justify-center"
        >
          {isExpanded ? <PanelLeftClose className="w-5 h-5 text-brand" /> : <PanelLeft className="w-5 h-5 text-brand mx-auto" />}
        </button>
      </div>

      {/* Navigation Links & Settings Inside ScrollArea with pb-12 so nothing is ever obscured by OS taskbar */}
      <ScrollArea className="flex-1 px-3 py-3">
        <nav className="space-y-6 pb-12">
          {effectiveNav.map((section) => (
            <div key={section.title}>
              <AnimatePresence>
                {isExpanded && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2.5 px-3.5"
                  >
                    {section.title}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/admin" && item.href !== "/student" && pathname.startsWith(item.href + "/"));
                  const Icon = item.icon;

                  const linkContent = (
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-md font-heading text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-brand/15 text-brand"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60 dark:hover:bg-white/[0.04]",
                        !isExpanded && "justify-center px-0 w-11 h-11 mx-auto"
                      )}
                    >
                      <Icon
                        className={cn(
                          "shrink-0 transition-transform duration-200 group-hover:scale-110",
                          isActive ? "text-brand w-5 h-5" : "text-muted-foreground group-hover:text-foreground w-5 h-5"
                        )}
                      />
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2 }}
                            className="whitespace-nowrap overflow-hidden flex-1"
                          >
                            {item.title}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {isExpanded && item.badge && (
                        <span className="ml-auto text-[11px] bg-brand/20 text-brand px-2 py-0.5 rounded-full font-semibold border border-brand/30">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );

                  if (!isExpanded) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger render={linkContent} />
                        <TooltipContent side="right" sideOffset={14} className="glass-popover border-white/10 font-medium">
                          {item.title}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={item.href}>{linkContent}</div>;
                })}
              </div>
            </div>
          ))}

          {/* Settings Section directly inside scrollable nav */}
          <div className="pt-4 mt-2 border-t border-border/40 space-y-1">
            <AnimatePresence>
              {isExpanded && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3.5"
                >
                  SETTINGS
                </motion.p>
              )}
            </AnimatePresence>

            {!isExpanded ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href="/settings"
                      className="group relative flex items-center justify-center w-11 h-11 mx-auto rounded-md font-heading text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent/60 dark:hover:bg-white/[0.04]"
                    >
                      <Settings className="w-4.5 h-4.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
                  }
                />
                <TooltipContent side="right" sideOffset={14} className="glass-popover font-heading">
                  Setting
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/settings"
                className="group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-md font-heading text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent/60 dark:hover:bg-white/[0.04]"
              >
                <Settings className="w-4.5 h-4.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="whitespace-nowrap">Setting</span>
              </Link>
            )}

            {!isExpanded ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={handleLogout}
                      className="w-full group relative flex items-center justify-center w-11 h-11 mx-auto rounded-md font-heading text-sm font-medium transition-all duration-200 text-orange-500 hover:bg-orange-500/10"
                    >
                      <LogOut className="w-4.5 h-4.5 shrink-0 text-orange-500" />
                    </button>
                  }
                />
                <TooltipContent side="right" sideOffset={14} className="glass-popover font-heading text-orange-500">
                  Logout
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-md font-heading text-sm font-medium transition-all duration-200 text-orange-500 hover:bg-orange-500/10"
              >
                <LogOut className="w-4.5 h-4.5 shrink-0 text-orange-500" />
                <span className="whitespace-nowrap">Logout</span>
              </button>
            )}
          </div>
        </nav>
      </ScrollArea>
    </motion.aside>
  );
}
