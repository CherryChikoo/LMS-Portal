"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SelectOption } from "@/types";

export interface FilterDropdownProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  variant?: "default" | "batch";
  className?: string;
  loading?: boolean;
  resolveLabel?: (value: string) => string;
}

export function FilterDropdown({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  variant = "default",
  className,
  loading,
  resolveLabel,
}: FilterDropdownProps) {
  const isBatch = variant === "batch";

  // Use "ALL" as the internal value for empty states to work seamlessly with Radix UI Select
  const internalValue = value || "ALL";
  
  const hasValidOptions = options.some(opt => opt.value !== "");
  const isValidValue = internalValue === "ALL" || options.some(opt => opt.value === internalValue);
  const displayValue = isValidValue ? internalValue : "ALL";

  const allLabel = loading
    ? `Loading ${label}s...`
    : (placeholder || `All ${label}s`);

  // Determine what to render in the trigger
  let triggerContent = allLabel;
  if (loading) {
    triggerContent = "Loading...";
  } else if (internalValue !== "ALL") {
    if (resolveLabel) {
      triggerContent = resolveLabel(internalValue);
    } else {
      const targetStr = String(internalValue).trim().toLowerCase();
      const found = options.find(o => 
        String(o.value).trim().toLowerCase() === targetStr || 
        String(o.label).trim().toLowerCase() === targetStr
      );
      triggerContent = found ? found.label : String(internalValue);
    }
  }

  // Never auto-disable filter dropdowns; keep them interactive at all times
  const isDisabled = !!disabled;

  return (
    <div className={cn("flex flex-col gap-2 w-full min-w-0", className)}>
      <label className={cn(
        "text-[11px] font-extrabold uppercase tracking-widest px-1",
        isBatch ? "text-amber-500" : "text-muted-foreground"
      )}>
        {label}
      </label>
      <div className="relative">
        <select
          value={displayValue}
          onChange={(e) => onChange(!e.target.value || e.target.value === "ALL" ? "" : e.target.value)}
          disabled={isDisabled}
          className={cn(
            "w-full h-12 px-4 pr-10 rounded-xl bg-card border shadow-sm text-sm font-semibold transition-all appearance-none outline-none cursor-pointer truncate",
            isBatch 
              ? "border-amber-500/40 text-amber-500 hover:border-amber-500/60 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20" 
              : "border-border text-foreground hover:border-brand/40 focus:border-brand focus:ring-1 focus:ring-brand/20",
            isDisabled && "opacity-50 cursor-not-allowed bg-muted/50"
          )}
        >
          <option value="ALL">{allLabel}</option>
          {options
            .filter(opt => opt.value !== "")
            .map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-50"><path d="M3.13523 6.15803C3.3241 5.95657 3.64052 5.94637 3.84197 6.13523L7.5 9.56464L11.158 6.13523C11.3595 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67591 11.842 6.86477L7.84197 10.6148C7.64964 10.7951 7.35036 10.7951 7.15803 10.6148L3.15803 6.86477C2.95657 6.67591 2.94637 6.35949 3.13523 6.15803Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
        </div>
      </div>
    </div>
  );
}
