"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

interface GlobalLoadingContextType {
  isLoading: boolean;
  message: string;
  startLoading: (msg?: string) => void;
  stopLoading: () => void;
  withLoading: <T>(fn: () => Promise<T>, msg?: string) => Promise<T>;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextType | undefined>(undefined);

// Event emitter singleton so non-React functions can also trigger the blocker
type LoadingListener = (loading: boolean, message?: string) => void;
const listeners = new Set<LoadingListener>();

export const globalLoading = {
  start: (message: string = "Processing request...") => {
    if (typeof window === "undefined") return;
    listeners.forEach((l) => l(true, message));
  },
  stop: () => {
    if (typeof window === "undefined") return;
    listeners.forEach((l) => l(false));
  },
  wrap: async <T,>(fn: () => Promise<T>, message: string = "Processing request..."): Promise<T> => {
    const startTime = Date.now();
    globalLoading.start(message);
    try {
      return await fn();
    } finally {
      const elapsed = Date.now() - startTime;
      const minDisplayTime = 500; // minimum 500ms ensures smooth visual feedback instead of flashing
      if (elapsed < minDisplayTime) {
        await new Promise((r) => setTimeout(r, minDisplayTime - elapsed));
      }
      globalLoading.stop();
    }
  }
};

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingCount, setLoadingCount] = useState(0);
  const [message, setMessage] = useState("Processing request...");

  const startLoading = useCallback((msg: string = "Processing request...") => {
    setMessage(msg);
    setLoadingCount((c) => c + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount((c) => Math.max(0, c - 1));
  }, []);

  const withLoading = useCallback(
    async <T,>(fn: () => Promise<T>, msg: string = "Processing request..."): Promise<T> => {
      const startTime = Date.now();
      startLoading(msg);
      try {
        return await fn();
      } finally {
        const elapsed = Date.now() - startTime;
        const minDisplayTime = 500;
        if (elapsed < minDisplayTime) {
          await new Promise((r) => setTimeout(r, minDisplayTime - elapsed));
        }
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  useEffect(() => {
    const handler: LoadingListener = (loading, msg) => {
      if (loading) {
        if (msg) setMessage(msg);
        setLoadingCount((c) => c + 1);
      } else {
        setLoadingCount((c) => Math.max(0, c - 1));
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const isLoading = loadingCount > 0;

  return (
    <GlobalLoadingContext.Provider
      value={{
        isLoading,
        message,
        startLoading,
        stopLoading,
        withLoading,
      }}
    >
      {children}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            key="global-loading-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/65 backdrop-blur-md select-none cursor-wait"
            aria-live="assertive"
            role="status"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="flex flex-col items-center gap-5 p-8 rounded-3xl bg-card/90 border border-border/80 shadow-2xl max-w-sm w-full mx-4 text-center backdrop-blur-xl"
            >
              <div className="relative flex items-center justify-center py-1">
                {/* Single clean spinning brand ring */}
                <div className="w-12 h-12 rounded-full border-[3px] border-brand/20 border-t-brand animate-spin" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-foreground tracking-tight">
                  {message}
                </h3>
                <p className="text-xs text-muted-foreground animate-pulse">
                  Please wait while the portal updates...
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (!context) {
    throw new Error("useGlobalLoading must be used within a GlobalLoadingProvider");
  }
  return context;
}
