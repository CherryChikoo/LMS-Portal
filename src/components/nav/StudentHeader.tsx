"use client";

import { useState, useEffect, useCallback } from "react";
import { Menu, Moon, Sun, PanelLeft } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logoutUser } from "@/lib/services/auth-service";
import { formatDisplayName } from "@/lib/utils";
import { NAVIGATION } from "@/lib/constants";

export function StudentHeader() {
  const { openMobile, toggle } = useSidebar();
  const isMobile = useIsMobile();
  const mounted = useMounted();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  const [userName, setUserName] = useState("User");
  const [initials, setInitials] = useState("US");

  // Hide header entirely if the user is actively taking or reviewing an exam
  const isExamTakeRoute =
    pathname !== null && /^\/student\/exams\/[^/]+\/(take|review)(\/|$)/.test(pathname);

  const loadUserInfo = useCallback(() => {
    if (typeof window === "undefined") return;
    const savedUser = localStorage.getItem("lms_user") || localStorage.getItem("user");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        const name = u.name || u.displayName || "User";
        setUserName(formatDisplayName(name));
        const parts = name.split(" ").filter(Boolean);
        const init = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0]?.slice(0, 2).toUpperCase() || "US";
        setInitials(init);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    loadUserInfo();
    window.addEventListener("storage", loadUserInfo);
    return () => window.removeEventListener("storage", loadUserInfo);
  }, [loadUserInfo]);

  if (isExamTakeRoute) {
    return null;
  }

  // Find current page title
  const currentNavItem = NAVIGATION.flatMap((s) => s.items).find(
    (item) => item.href !== "/" && pathname?.startsWith(`/student${item.href}`)
  );
  const pageTitle = currentNavItem ? currentNavItem.title : pathname === "/student" ? "Dashboard" : "Overview";

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {}
  };

  return (
    <header className="sticky top-0 z-20 w-full bg-background/80 backdrop-blur-md border-b border-border/40 shrink-0">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-muted-foreground hover:text-foreground shrink-0"
            onClick={openMobile}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg shrink-0 transition-all duration-300"
            onClick={toggle}
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          
          <h1 className="text-xl font-bold tracking-tight text-foreground hidden sm:block">
            {pageTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Tooltip>
            <TooltipTrigger render={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded-full w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0 relative overflow-hidden"
              >
                {mounted ? (
                  theme === "dark" ? (
                    <Sun className="h-[1.15rem] w-[1.15rem] shrink-0" />
                  ) : (
                    <Moon className="h-[1.15rem] w-[1.15rem] shrink-0" />
                  )
                ) : (
                  <div className="w-[1.15rem] h-[1.15rem]" />
                )}
              </Button>
            } />
            <TooltipContent side="bottom" align="center" className="glass-popover">
              <p>Toggle Theme</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" className="relative h-9 w-9 rounded-full shrink-0 ml-1">
                <Avatar className="h-9 w-9 shadow-sm shrink-0 border border-border/50 transition-all duration-300 hover:scale-105 hover:shadow-md hover:border-brand/30">
                  <AvatarImage src="" alt={userName} />
                  <AvatarFallback className="bg-brand/10 text-brand text-xs font-bold shrink-0">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            } />
            <DropdownMenuContent className="w-56 glass-popover" align="end">
              <div className="flex flex-col space-y-1 p-2">
                <p className="text-sm font-medium leading-none truncate">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground truncate font-medium">
                  Student
                </p>
              </div>
              <DropdownMenuSeparator className="bg-border/50" />
              <DropdownMenuItem render={
                <Link href="/student/settings" className="cursor-pointer focus:bg-muted/50 block w-full px-2 py-1.5 text-sm rounded-sm">Profile Settings</Link>
              } />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive font-medium">
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
