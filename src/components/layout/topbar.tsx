"use client";

import { useState, useEffect, useCallback } from "react";
import { Menu, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSidebar } from "@/hooks/use-sidebar";
import { useIsMobile } from "@/hooks/use-media-query";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { logoutUser } from "@/lib/services/auth-service";

export function Topbar() {
  const { openMobile } = useSidebar();
  const isMobile = useIsMobile();
  const mounted = useMounted();

  const [userName, setUserName] = useState("Trainer");
  const [userRole, setUserRole] = useState("Trainer");
  const [initials, setInitials] = useState("TR");

  const loadUserInfo = useCallback(() => {
    const savedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
    const savedRole = localStorage.getItem("lms_role");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u.name || u.displayName) {
          const name = u.name || u.displayName;
          setUserName(name);
          const parts = name.split(" ");
          setInitials(parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2).toUpperCase());
        }
        if (u.role === "student" || savedRole === "student") {
          setUserRole("Student");
        } else if (u.role === "admin" || savedRole === "admin") {
          setUserRole("Administrator");
        } else {
          setUserRole("Trainer");
        }
      } catch (e) { }
    } else if (savedRole === "admin") {
      setUserName("System Admin");
      setUserRole("Administrator");
      setInitials("AD");
    }
  }, []);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    loadUserInfo();

    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);

    // Listen for storage events (from Settings page name changes)
    const handleStorageChange = () => {
      loadUserInfo();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadUserInfo]);

  return (
    <header
      className={`sticky top-0 z-30 h-20 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 transition-all duration-300 ${scrolled
        ? "bg-[#0A0A0A]/95 backdrop-blur-2xl border-b border-[#222222]"
        : "bg-[#0A0A0A] border-b border-transparent"
        }`}
    >
      {/* Left / Mobile menu button */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={openMobile}
            className="lg:hidden text-muted-foreground hover:text-foreground rounded-xl border border-border"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        {/* Global Search Bar */}
        <div className="relative w-full max-w-md group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-brand transition-colors pointer-events-none" />
          <input
            type="text"
            placeholder="Search here..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#111111] border border-[#222222] text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand transition-all"
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Action Pill Button */}
        {userRole.toLowerCase() !== "student" && (
          <Link href={userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "administrator" ? "/admin/exams" : "/exams"} className="hidden md:block">
            <Button
              size="sm"
              className="h-10 px-4 rounded-xl bg-gradient-brand text-white font-medium border border-white/20 shadow-none hover:opacity-95 transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Quick Assessment</span>
            </Button>
          </Link>
        )}



        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-11 pl-2 pr-3 rounded-xl bg-[#111111] border-0 hover:bg-[#1a1a1a] transition-all flex items-center gap-2.5 shadow-none"
              >
                <Avatar className="h-7 w-7 ring-2 ring-brand/30">
                  <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userName)}`} />
                  <AvatarFallback className="bg-gradient-brand text-white text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold text-foreground hidden sm:inline-block">
                  {userName}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56 glass-popover border-white/10 rounded-xl p-2 shadow-2xl">
            <div className="px-3 py-2.5 border-b border-border/40 dark:border-white/[0.06] mb-1">
              <p className="text-sm font-bold text-foreground">{userName}</p>
              <p className="text-xs font-mono text-emerald-400">{userRole}</p>
            </div>
            <DropdownMenuItem render={<Link href={userRole.toLowerCase() === "student" ? "/student/settings" : "/admin/settings"}>Account Settings</Link>} className="rounded-md cursor-pointer" />
            {userRole.toLowerCase() !== "student" && (
              <DropdownMenuItem render={<Link href="/admin/colleges">Manage Colleges</Link>} className="rounded-md cursor-pointer" />
            )}
            <DropdownMenuSeparator className="bg-border/40 dark:bg-white/[0.06]" />
            <DropdownMenuItem
              onClick={async () => {
                await logoutUser();
              }}
              className="rounded-md cursor-pointer text-destructive focus:text-destructive"
            >
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
