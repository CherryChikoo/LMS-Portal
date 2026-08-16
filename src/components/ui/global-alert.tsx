"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldAlert, AlertCircle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface GlobalAlertProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: "error" | "warning" | "info";
  variant?: "modal" | "inline";
  confirmText?: string;
  onConfirm?: () => void;
}

export function GlobalAlert({
  isOpen,
  onClose,
  title,
  message,
  type = "error",
  variant = "modal",
  confirmText = "Okay",
  onConfirm,
}: GlobalAlertProps) {
  const defaultTitle =
    title ||
    (type === "error"
      ? "Notice"
      : type === "warning"
      ? "Access Restricted"
      : "Information");

  const getIcon = () => {
    switch (type) {
      case "error":
        return <ShieldAlert className="w-7 h-7 text-amber-400" />;
      case "warning":
        return <AlertCircle className="w-7 h-7 text-amber-500" />;
      default:
        return <Info className="w-7 h-7 text-blue-400" />;
    }
  };

  const handleConfirm = () => {
    onClose();
    if (onConfirm) onConfirm();
  };

  if (variant === "inline") {
    return (
      <AnimatePresence>
        {isOpen && message && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full bg-[#12131a] border border-white/10 rounded-2xl p-4 flex items-start justify-between gap-3 shadow-lg my-3"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                {getIcon()}
              </div>
              <div className="space-y-1 text-left">
                <h4 className="text-sm font-bold text-white tracking-tight">
                  {defaultTitle}
                </h4>
                <p className="text-xs text-white/70 leading-relaxed">
                  {message.replace(/^Error:\s*/i, "").trim()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && message && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-md rounded-2xl md:rounded-3xl border border-white/10 bg-[#0d0e12] p-6 sm:p-7 shadow-2xl space-y-5 text-center relative overflow-hidden"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-white/40 hover:text-white transition-colors rounded-xl hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-inner">
                {getIcon()}
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {defaultTitle}
              </h3>
              <p className="text-sm text-white/70 leading-relaxed max-w-sm">
                {message.replace(/^Error:\s*/i, "").trim()}
              </p>
            </div>

            <div className="pt-2 flex justify-center items-center gap-3">
              <Button
                type="button"
                onClick={handleConfirm}
                className="w-full sm:w-auto px-8 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-all border border-white/10 cursor-pointer"
              >
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
