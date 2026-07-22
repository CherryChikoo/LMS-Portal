"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "interactive" | "subtle";
  hover?: boolean;
  gradient?: boolean;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      variant = "default",
      hover = false,
      gradient = false,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border transition-shadow duration-200",
          // Variants
          variant === "default" && "glass-card",
          variant === "elevated" &&
            "glass-card shadow-lg dark:shadow-xl dark:shadow-black/20",
          variant === "interactive" &&
            "glass-card cursor-pointer",
          variant === "subtle" &&
            "bg-card/50 border-border/50 dark:bg-white/[0.02] dark:border-white/[0.06]",
          // Hover
          hover &&
            "hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-black/20 hover:border-brand/20",
          // Gradient border effect
          gradient &&
            "border-transparent bg-clip-padding relative before:absolute before:inset-0 before:rounded-xl before:p-[1px] before:bg-gradient-to-br before:from-brand/20 before:to-transparent before:-z-10",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
GlassCard.displayName = "GlassCard";

interface AnimatedGlassCardProps extends HTMLMotionProps<"div"> {
  variant?: "default" | "elevated" | "interactive" | "subtle";
  hover?: boolean;
  gradient?: boolean;
}

function AnimatedGlassCard({
  className,
  children,
  hover = true,
  variant = "default",
  gradient = false,
  ...props
}: AnimatedGlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -2, transition: { duration: 0.15 } } : undefined}
      whileTap={hover ? { scale: 0.995 } : undefined}
      className={cn(
        "rounded-xl border transition-shadow duration-200",
        variant === "default" && "glass-card",
        variant === "elevated" && "glass-card shadow-lg dark:shadow-xl dark:shadow-black/20",
        variant === "interactive" && "glass-card cursor-pointer",
        variant === "subtle" && "bg-card/50 border-border/50 dark:bg-white/[0.02] dark:border-white/[0.06]",
        hover && "hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-black/20 hover:border-brand/20",
        gradient && "border-transparent bg-clip-padding relative before:absolute before:inset-0 before:rounded-xl before:p-[1px] before:bg-gradient-to-br before:from-brand/20 before:to-transparent before:-z-10",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export { GlassCard, AnimatedGlassCard };
