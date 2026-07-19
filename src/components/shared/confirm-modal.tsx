"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Trash2, Info, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "warning" | "info" | "success";
  isAlert?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  isAlert = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case "destructive":
        return <Trash2 className="w-6 h-6 text-rose-500" />;
      case "warning":
        return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case "success":
        return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
      default:
        return <Info className="w-6 h-6 text-brand" />;
    }
  };

  const getBadgeClass = () => {
    switch (variant) {
      case "destructive":
        return "bg-rose-500/10 border-rose-500/20";
      case "warning":
        return "bg-amber-500/10 border-amber-500/20";
      case "success":
        return "bg-emerald-500/10 border-emerald-500/20";
      default:
        return "bg-brand/10 border-brand/20";
    }
  };

  const getButtonVariant = () => {
    if (variant === "destructive") return "destructive";
    return "default";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm relative overflow-hidden"
          >
            {/* Background Accent Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-brand/10 blur-3xl pointer-events-none" />

            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${getBadgeClass()}`}
              >
                {getIcon()}
              </div>

              <div className="space-y-1.5 flex-1 pr-6">
                <h3 className="text-base font-bold text-foreground leading-tight">
                  {title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {message}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/40">
              {!isAlert && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="rounded-xl h-10 px-5 text-xs font-semibold"
                >
                  {cancelText}
                </Button>
              )}
              <Button
                type="button"
                variant={getButtonVariant()}
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="rounded-xl h-10 px-6 text-xs font-semibold shadow-sm"
              >
                {isAlert ? "OK" : confirmText}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
