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
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      <label className={cn(
        "text-[11px] font-extrabold uppercase tracking-widest px-1",
        isBatch ? "text-amber-500" : "text-muted-foreground"
      )}>
        {label}
      </label>
      <Select 
        value={displayValue} 
        onValueChange={(val) => onChange(!val || val === "ALL" ? "" : val)} 
        disabled={isDisabled}
      >
        <SelectTrigger className={cn(
          "w-full h-12 px-4 rounded-xl bg-card border shadow-sm text-sm font-semibold transition-all",
          isBatch 
            ? "border-amber-500/40 text-amber-500 hover:border-amber-500/60 focus-visible:border-amber-500 focus-visible:ring-amber-500/20 data-[state=open]:border-amber-500/60" 
            : "border-border text-foreground hover:border-brand/40 focus-visible:border-brand focus-visible:ring-brand/20 data-[state=open]:border-brand/40",
          isDisabled && "opacity-50 cursor-not-allowed bg-muted/50"
        )}>
          <SelectValue placeholder={allLabel}>
             {internalValue !== "ALL" ? triggerContent : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={cn(
          "rounded-xl shadow-xl border p-1 bg-popover",
          isBatch ? "border-amber-500/30" : "border-border"
        )}>
          <SelectItem 
            value="ALL" 
            className={cn(
              "rounded-md cursor-pointer text-sm font-medium transition-colors py-2",
              isBatch 
                ? "focus:bg-amber-500/10 focus:text-amber-600 data-[state=checked]:bg-amber-500/20 data-[state=checked]:text-amber-600"
                : "focus:bg-brand/10 focus:text-brand data-[state=checked]:bg-brand/10 data-[state=checked]:text-brand"
            )}
          >
            {allLabel}
          </SelectItem>
          {options
            .filter(opt => opt.value !== "") // Ensure we don't map an empty string option if provided
            .map((opt) => (
            <SelectItem 
              key={opt.value} 
              value={opt.value}
              className={cn(
                "rounded-md cursor-pointer text-sm font-medium transition-colors py-2",
                isBatch 
                  ? "focus:bg-amber-500/10 focus:text-amber-600 data-[state=checked]:bg-amber-500/20 data-[state=checked]:text-amber-600"
                  : "focus:bg-brand/10 focus:text-brand data-[state=checked]:bg-brand/10 data-[state=checked]:text-brand"
              )}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
