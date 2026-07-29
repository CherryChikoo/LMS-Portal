"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { parseLmsError, ParsedError } from "@/lib/firebase-error-handler";
import { AlertCircle, XCircle, ShieldAlert, WifiOff, ServerCrash, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface ErrorContextType {
  showError: (error: unknown, retryFn?: () => void, customTitle?: string) => void;
  clearError: () => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export function useErrorHandler() {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useErrorHandler must be used within an ErrorProvider");
  }
  return context;
}

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errorState, setErrorState] = useState<{
    parsed: ParsedError;
    retryFn?: () => void;
  } | null>(null);

  const showError = (error: unknown, retryFn?: () => void, customTitle?: string) => {
    const parsed = parseLmsError(error);
    if (customTitle) parsed.title = customTitle;
    setErrorState({ parsed, retryFn });
  };

  const clearError = () => setErrorState(null);

  const getIcon = (category: string) => {
    switch (category) {
      case "network": return <WifiOff className="w-8 h-8 text-amber-500" />;
      case "permission": return <ShieldAlert className="w-8 h-8 text-rose-500" />;
      case "authentication": return <AlertCircle className="w-8 h-8 text-purple-500" />;
      case "validation": return <XCircle className="w-8 h-8 text-orange-500" />;
      case "server": return <ServerCrash className="w-8 h-8 text-rose-600" />;
      default: return <HelpCircle className="w-8 h-8 text-gray-500" />;
    }
  };

  return (
    <ErrorContext.Provider value={{ showError, clearError }}>
      {children}
      <AnimatePresence>
        {errorState && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
              onClick={clearError}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-10"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-2xl bg-secondary/50 border border-border/50">
                    {getIcon(errorState.parsed.category)}
                  </div>
                  <button
                    onClick={clearError}
                    className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-accent"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h2 className="text-xl font-bold font-heading mb-2">
                  {errorState.parsed.title}
                </h2>
                
                <div className="space-y-4">
                  <p className="text-sm text-foreground/90 leading-relaxed font-medium">
                    {errorState.parsed.message}
                  </p>
                  
                  <div className="bg-secondary/30 rounded-xl p-4 border border-border/50 space-y-3">
                    <div>
                      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block mb-1">
                        Possible Cause
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {errorState.parsed.cause}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block mb-1">
                        Suggested Action
                      </span>
                      <p className="text-xs text-brand leading-relaxed font-medium">
                        {errorState.parsed.action}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-secondary/20 border-t border-border flex items-center justify-end gap-3">
                <Button variant="ghost" onClick={clearError} className="font-semibold">
                  Dismiss
                </Button>
                {errorState.retryFn && errorState.parsed.isRetryable && (
                  <Button
                    onClick={() => {
                      clearError();
                      errorState.retryFn?.();
                    }}
                    className={cn(
                      "font-bold shadow-sm",
                      errorState.parsed.category === "network" ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-brand hover:bg-brand/90 text-brand-foreground"
                    )}
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ErrorContext.Provider>
  );
}
