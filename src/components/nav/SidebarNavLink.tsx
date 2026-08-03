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
  const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));

  const content = (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300",
        "hover:bg-brand/10 w-full min-w-0 overflow-hidden",
        isActive ? "bg-brand font-medium shadow-sm shadow-brand/20" : "text-muted-foreground",
        isActive && "hover:bg-brand"
      )}
    >
      {isActive && (
        <div className="absolute inset-y-0 left-0 w-1 bg-white rounded-r-full" />
      )}
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
