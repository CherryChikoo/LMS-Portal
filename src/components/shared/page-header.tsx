import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 w-full min-w-0",
        className
      )}
    >
      <div className="flex-1 min-w-0 pr-0 sm:pr-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words">
          {title}
        </h1>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words" suppressHydrationWarning>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">{actions}</div>}
    </div>
  );
}
