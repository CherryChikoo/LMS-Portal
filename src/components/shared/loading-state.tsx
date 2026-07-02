import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "./glass-card";

interface LoadingStateProps {
  variant?: "cards" | "table" | "page" | "form";
  count?: number;
  className?: string;
}

export function LoadingState({
  variant = "cards",
  count = 4,
  className,
}: LoadingStateProps) {
  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <GlassCard key={i} variant="subtle" className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-3 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="w-11 h-11 rounded-xl" />
            </div>
          </GlassCard>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <GlassCard variant="subtle" className={cn("p-0 overflow-hidden", className)}>
        <div className="p-4 border-b border-border/50">
          <Skeleton className="h-4 w-48" />
        </div>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-border/30 last:border-0"
          >
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="h-4 flex-1 max-w-[200px]" />
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <Skeleton className="h-4 w-16 hidden md:block" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </GlassCard>
    );
  }

  if (variant === "form") {
    return (
      <GlassCard variant="subtle" className={cn("p-6 space-y-6", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 rounded-xl" />
      </GlassCard>
    );
  }

  // page variant
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      <LoadingState variant="cards" count={4} />
      <LoadingState variant="table" count={5} />
    </div>
  );
}
