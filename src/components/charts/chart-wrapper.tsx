"use client";

import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/shared/glass-card";
import { type ReactNode } from "react";

interface ChartWrapperProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartWrapper({
  title,
  description,
  action,
  children,
  className,
}: ChartWrapperProps) {
  return (
    <GlassCard className={cn("p-5", className)}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="w-full">{children}</div>
    </GlassCard>
  );
}
