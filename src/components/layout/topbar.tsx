"use client";

import { useState, useEffect, useCallback } from "react";
import { Menu, Search, Sparkles, Moon, Sun, PanelLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/providers/theme-provider";
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
import { NAVIGATION } from "@/lib/constants";

export function Topbar() {
  const { openMobile, toggle } = useSidebar();
  const isMobile = useIsMobile();
  const mounted = useMounted();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  const [userName, setUserName] = useState("User");
  const [userRole, setUserRole] = useState("Student");
  const [initials, setInitials] = useState("US");

  const loadUserInfo = useCallback(() => {
    if (typeof window === "undefined") return;
    const savedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
    const savedRole = localStorage.getItem("lms_role");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        const name = u.name || u.displayName || "User";
        setUserName(name);
        const parts = name.split(" ").filter(Boolean);
        const init = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0]?.slice(0, 2).toUpperCase() || "US";
        setInitials(init);
        if (u.role === "student" || savedRole === "student") {
          setUserRole("Student");
        } else if (u.role === "admin" || savedRole === "admin") {
          setUserRole("Administrator");
        } else {
          setUserRole("Trainer");
        }
      } catch (e) {}
    } else if (savedRole === "admin") {
      setUserName("System Admin");
      setUserRole("Administrator");
      setInitials("AD");
    } else if (savedRole === "student") {
      setUserName("Student");
      setUserRole("Student");
      setInitials("ST");
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

  const getPageTitle = () => {
    if (!pathname || pathname === "/" || pathname === "/admin" || pathname === "/student" || pathname === "/college") {
      return "Dashboard";
    }

    for (const section of NAVIGATION) {
      for (const item of section.items) {
        if (pathname.includes(item.href) && item.href !== "/") {
          return item.title;
        }
      }
    }

    const parts = pathname.split("/").filter(Boolean);
    const mainPart = parts[parts.length - 1];
    if (mainPart) {
      return mainPart.charAt(0).toUpperCase() + mainPart.slice(1).replace(/-/g, " ");
    }

    return "Dashboard";
  };

  const pageTitle = getPageTitle();

  return (
    <header
      className={`sticky top-0 z-30 h-20 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 transition-all duration-300 ${scrolled
        ? "bg-background/95 backdrop-blur-2xl border-b border-border shadow-sm"
        : "bg-background border-b border-border"
        }`}
    >
      {/* Left / Mobile menu button */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <Button
          variant="ghost"
          size="icon"
          onClick={openMobile}
          className="lg:hidden text-muted-foreground hover:text-foreground rounded-xl border border-border flex shrink-0 items-center justify-center"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="hidden lg:flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="text-foreground hover:bg-accent rounded-lg flex shrink-0 items-center justify-center"
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
          <div className="w-px h-5 bg-border mx-1"></div>
          <h2 className="text-base font-bold text-foreground">{pageTitle}</h2>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Action Pill Button */}
        {userRole.toLowerCase() !== "student" && (
          <Link href={userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "administrator" ? "/admin/exams?action=new-markdown" : "/exams?action=new-markdown"} className="hidden md:block">
            <Button
              size="sm"
              className="h-10 px-4 rounded-xl bg-brand text-brand-foreground dark:text-brand-foreground font-medium border border-white/20 dark:border-black/10 shadow-none hover:opacity-95 transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Quick Assessment</span>
            </Button>
          </Link>
        )}

        {/* Theme Toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-10 w-10 rounded-full border border-border bg-secondary hover:bg-accent text-foreground"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        )}

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-11 pl-2 pr-4 rounded-full bg-secondary border border-border hover:bg-accent transition-all flex items-center gap-2.5 shadow-none"
              >
                <Avatar className="h-7 w-7 ring-2 ring-brand/30">
                  <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userName)}`} />
                  <AvatarFallback className="bg-brand text-brand-foreground dark:text-brand-foreground text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-semibold text-foreground hidden sm:inline-block">
                  {userName}
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56 bg-popover border-border rounded-xl p-2 shadow-2xl">
            <div className="px-3 py-2.5 border-b border-border mb-1">
              <p className="text-sm font-bold text-foreground">{userName}</p>
              <p className="text-xs text-muted-foreground font-medium">{userRole}</p>
            </div>
            <DropdownMenuItem render={<Link href={userRole.toLowerCase() === "student" ? "/student/settings" : "/admin/settings"}>Account Settings</Link>} className="rounded-md cursor-pointer" />
            {userRole.toLowerCase() !== "student" && (
              <DropdownMenuItem render={<Link href="/admin/colleges">Manage Colleges</Link>} className="rounded-md cursor-pointer" />
            )}
            <DropdownMenuSeparator className="bg-border" />
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
