"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  reset: () => {
    if (typeof window === "undefined") return;
    listeners.forEach((l) => l(false, "__RESET__"));
  },
  wrap: async <T,>(fn: () => Promise<T>, message: string = "Processing request..."): Promise<T> => {
    globalLoading.start(message);
    try {
      return await fn();
    } finally {
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
      startLoading(msg);
      try {
        return await fn();
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  useEffect(() => {
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    const handler: LoadingListener = (loading, msg) => {
      if (safetyTimer) clearTimeout(safetyTimer);
      if (loading) {
        if (msg) setMessage(msg);
        setLoadingCount((c) => c + 1);
        // Safety timeout: auto-clear after 6 seconds if any background promise hung
        safetyTimer = setTimeout(() => {
          setLoadingCount(0);
        }, 6000);
      } else {
        if (msg === "__RESET__") {
          setLoadingCount(0);
        } else {
          setLoadingCount((c) => Math.max(0, c - 1));
        }
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      if (safetyTimer) clearTimeout(safetyTimer);
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
            key="global-top-loading-bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed top-0 left-0 right-0 z-[99999] h-[3px] bg-transparent pointer-events-none overflow-hidden"
          >
            <div
              className="h-full w-1/2 bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_8px_var(--brand)] animate-pulse"
              style={{
                animation: "shimmer 1.5s infinite linear",
              }}
            />
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
