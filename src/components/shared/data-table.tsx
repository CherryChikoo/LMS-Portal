"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { GlassCard } from "./glass-card";
import { EmptyState } from "./empty-state";
import { LoadingState } from "./loading-state";
import { type LucideIcon, Database } from "lucide-react";

interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyIcon = Database,
  emptyTitle = "No data found",
  emptyDescription = "There are no items to display at the moment.",
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return <LoadingState variant="table" count={5} className={className} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    );
  }

  return (
    <GlassCard variant="subtle" className={cn("overflow-hidden p-0", className)}>
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted/30 dark:bg-white/[0.02]",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, idx) => (
            <TableRow
              key={idx}
              onClick={() => onRowClick?.(item)}
              className={cn(
                "border-border/30 transition-colors",
                onRowClick && "cursor-pointer hover:bg-accent/50"
              )}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={cn("py-3", col.className)}>
                  {col.render
                    ? col.render(item)
                    : (item[col.key] as React.ReactNode)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </GlassCard>
  );
}
