"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, ClipboardList, Trophy, Medal, FolderOpen, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { APP_NAME } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMounted } from "@/hooks/use-mounted";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logoutUser } from "@/lib/services/auth-service";
import { useBranding } from "@/providers/branding-provider";
import { SidebarNavLink } from "./SidebarNavLink";

export function StudentSidebar() {
  const pathname = usePathname();
  const { isExpanded } = useSidebar();
  const { branding, loading } = useBranding();
  const mounted = useMounted();

  // Hide the sidebar entirely if the user is actively taking or reviewing an exam
  const isExamTakeRoute =
    pathname !== null && /^\/student\/exams\/[^/]+\/(take|review)(\/|$)/.test(pathname);

  if (isExamTakeRoute) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {}
  };

  // Only get the navigation items meant for students
  const studentNavBase = [
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
  ];

  const effectiveNav = studentNavBase.map(section => ({
    ...section,
    items: section.items.map(item => {
      // Re-map student routes under /student
      const prefix = item.href === "/" ? "/student" : `/student${item.href}`;
      return { ...item, href: prefix };
    })
  }));

  return (
    <aside
      className={cn(
        "peer hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-30 bg-sidebar text-sidebar-foreground border-r border-border overflow-hidden",
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
        <Link href="/student" className="flex items-center w-full min-w-0">
          <div className="w-11 h-11 flex items-center justify-center shrink-0">
            {!mounted || loading ? (
              <div className="w-9 h-9 rounded-xl bg-brand/10 animate-pulse border border-brand/20 shrink-0" />
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
              isExpanded ? "opacity-100" : "opacity-0 absolute pointer-events-none"
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
            ) : (
              <>
                <span className="font-bold text-base text-brand tracking-tight truncate">
                  {branding.companyName || APP_NAME}
                </span>
                <span className="text-[9px] font-bold text-brand/60 uppercase tracking-widest truncate">
                  {branding.companySubtitle || "Student Portal"}
                </span>
              </>
            )}
          </div>
        </Link>
      </div>

      <ScrollArea className="flex-1 px-3 py-2 min-h-0">
        <nav className="space-y-6 pb-6">
          {effectiveNav.map((section, idx) => (
            <div key={idx}>
              {isExpanded && (
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3 mt-1 truncate">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarNavLink
                    key={item.href}
                    href={item.href}
                    title={item.title}
                    icon={item.icon}
                    isExpanded={isExpanded}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer Settings & Logout */}
      <div className="shrink-0 pt-2 border-t border-border/40 px-3 pb-4 space-y-1">
        <Tooltip disabled={isExpanded}>
          <TooltipTrigger render={
            <Link
              href="/student/settings"
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
          } />
          <TooltipContent side="right" sideOffset={12} className="glass-popover font-medium">
            Settings
          </TooltipContent>
        </Tooltip>

        <Tooltip disabled={isExpanded}>
          <TooltipTrigger render={
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
                Sign out
              </span>
            </button>
          } />
          <TooltipContent side="right" sideOffset={12} className="glass-popover text-destructive font-medium border-destructive/20">
            Sign out
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
