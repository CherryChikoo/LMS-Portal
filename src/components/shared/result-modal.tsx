"use client";

import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResultModalProps {
  isOpen: boolean;
  type: "success" | "error";
  title: string;
  message: string;
  onClose: () => void;
}

export function ResultModal({ isOpen, type, title, message, onClose }: ResultModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100000] bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-card border border-border rounded-3xl shadow-2xl max-w-md w-full pointer-events-auto overflow-hidden"
            >
              {/* Icon Section */}
              <div className={`relative p-8 ${type === "success" ? "bg-green-500/10" : "bg-rose-500/10"}`}>
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-xl hover:bg-background/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: "spring", duration: 0.6 }}
                  className="flex justify-center"
                >
                  {type === "success" ? (
                    <div className="relative">
                      <CheckCircle2 className="w-24 h-24 text-green-500" />
                      <div className="absolute inset-0 bg-green-500/30 blur-2xl rounded-full" />
                    </div>
                  ) : (
                    <div className="relative">
                      <XCircle className="w-24 h-24 text-rose-500" />
                      <div className="absolute inset-0 bg-rose-500/30 blur-2xl rounded-full" />
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Content Section */}
              <div className="p-8 space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-center space-y-2"
                >
                  <h3 className="text-2xl font-bold text-foreground">
                    {title}
                  </h3>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {message}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <Button
                    onClick={onClose}
                    className={`w-full h-12 rounded-xl font-semibold text-base ${
                      type === "success"
                        ? "bg-green-500 hover:bg-green-600 text-white"
                        : "bg-rose-500 hover:bg-rose-600 text-white"
                    }`}
                  >
                    {type === "success" ? "Great!" : "Got it"}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
