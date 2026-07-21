"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  LogOut,
  Settings,
  LayoutDashboard,
  ClipboardList,
  Trophy,
  Medal,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { NAVIGATION, APP_NAME } from "@/lib/constants";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBranding } from "@/providers/branding-provider";

export function MobileSidebar() {
  const pathname = usePathname();
  const { isMobileOpen, closeMobile } = useSidebar();
  const [userRole, setUserRole] = useState<string | null>(null);

  const { branding } = useBranding();

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

  const effectiveNav = useMemo(() => {
    if (!userRole) return [];
    let base = NAVIGATION;
    if (userRole === "student") {
      base = [
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
      ];
    }

    if (userRole === "college_admin") {
      base = base.map(sec => ({
        ...sec,
        items: sec.items.filter(it => it.href !== "/colleges" && it.href !== "/audit")
      })).filter(sec => sec.items.length > 0);
    }
    
    return base;
  }, [userRole]);

  return (
    <Sheet open={isMobileOpen} onOpenChange={closeMobile}>
      <SheetContent side="left" className="w-[300px] p-0 bg-sidebar backdrop-blur-2xl text-foreground flex flex-col border-0" style={{ fontFamily: '"Montserrat", sans-serif' }}>
        {/* Logo */}
        <div className="flex items-center h-20 px-5 shrink-0 border-b border-border/30">
          <Link href="/" className="flex items-center gap-3 overflow-hidden flex-1" onClick={closeMobile}>
            {branding.logoBase64 ? (
              <img
                src={branding.logoBase64}
                alt="Company Logo"
                className="w-8 h-8 object-contain rounded-lg shrink-0"
              />
            ) : null}
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 tracking-tight truncate">{branding.companyName || APP_NAME}</span>
              <span className="text-[10px] font-medium text-emerald-500 uppercase tracking-widest truncate">
                {userRole === "student" ? "Student Portal" : branding.companySubtitle || "Enterprise v2.4"}
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-4 py-4">
          <nav className="space-y-6 pb-12">
            {effectiveNav.map((section) => (
              <div key={section.title}>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2.5 px-3">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.items.map((item, index) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                      >
                        <Link
                          href={item.href}
                          onClick={closeMobile}
                          className={cn(
                            "flex items-center gap-3.5 px-3.5 py-2.5 rounded-md font-heading text-sm font-medium transition-all duration-200",
                            isActive
                              ? "bg-brand/15 text-brand"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/60 dark:hover:bg-white/[0.04]"
                          )}
                        >
                          <Icon
                            className={cn(
                              "w-5 h-5 shrink-0 transition-transform",
                              isActive ? "text-brand" : "text-muted-foreground"
                            )}
                          />
                          <span>{item.title}</span>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Settings Section directly inside scrollable nav */}
            <div className="pt-4 mt-2 border-t border-border/40 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3.5">
                SETTINGS
              </p>

              <Link
                href={userRole === "student" ? "/student/settings" : "/admin/settings"}
                onClick={closeMobile}
                className="group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-md font-heading text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent/60 dark:hover:bg-white/[0.04]"
              >
                <Settings className="w-4.5 h-4.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span>Settings</span>
              </Link>

              <button
                onClick={closeMobile}
                className="w-full group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-md font-heading text-sm font-medium transition-all duration-200 text-orange-500 hover:bg-orange-500/10"
              >
                <LogOut className="w-4.5 h-4.5 shrink-0 text-orange-500" />
                <span>Logout</span>
              </button>
            </div>
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
