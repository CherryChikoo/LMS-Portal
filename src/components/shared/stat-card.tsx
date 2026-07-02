"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useMotionValue } from "motion/react";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./glass-card";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  iconClassName?: string;
  suffix?: string;
  prefix?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  format?: "number" | "decimal" | "percentage";
  className?: string;
}

function AnimatedNumber({
  value,
  format = "number",
  prefix = "",
  suffix = "",
}: {
  value: number;
  format?: "number" | "decimal" | "percentage";
  prefix?: string;
  suffix?: string;
}) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: 60,
    damping: 20,
    mass: 0.5,
  });
  const [displayValue, setDisplayValue] = useState("0");
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!hasAnimated.current) {
      motionValue.set(0);
      hasAnimated.current = true;
    }
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (v) => {
      let formatted: string;
      if (format === "decimal" || format === "percentage") {
        formatted = v.toFixed(1);
      } else {
        formatted = Math.round(v).toLocaleString();
      }
      setDisplayValue(formatted);
    });
    return unsubscribe;
  }, [springValue, format]);

  return (
    <span className="font-heading tracking-tight">
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconClassName,
  suffix = "",
  prefix = "",
  trend,
  format = "number",
  className,
}: StatCardProps) {
  return (
    <GlassCard hover className={cn("p-5 relative overflow-hidden group h-full", className)}>
      {/* Background glow orb on hover */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none" />

      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-heading">
            {title}
          </p>
          <div className="text-3xl font-extrabold text-foreground">
            <AnimatedNumber
              value={value}
              format={format}
              prefix={prefix}
              suffix={suffix}
            />
          </div>
          {trend && (
            <div className="flex items-center gap-1.5 pt-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md",
                  trend.isPositive
                    ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-500 dark:text-red-400 border border-red-500/30"
                )}
              >
                {trend.isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
              </span>
              <span className="text-[11px] font-medium text-muted-foreground/80">vs last month</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "w-12 h-12 rounded-md flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300",
            iconClassName || "stat-icon-emerald"
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </GlassCard>
  );
}
