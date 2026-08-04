"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarNavLinkProps {
  href: string;
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
}

export function SidebarNavLink({ href, title, icon: Icon, isExpanded }: SidebarNavLinkProps) {
  const pathname = usePathname();
  const isActive =
    pathname === href ||
    (href !== "/admin" && href !== "/student" && href !== "/" && pathname?.startsWith(href + "/"));

  const content = (
    <Link
      href={href}
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
        {title}
      </span>
    </Link>
  );

  // TooltipTrigger expects a valid element/ref child, so we wrap content if needed, but it works directly in Radix if content is a link
  return (
    <Tooltip disabled={isExpanded}>
      <TooltipTrigger render={content} />
      <TooltipContent side="right" sideOffset={12} className="glass-popover font-medium">
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
