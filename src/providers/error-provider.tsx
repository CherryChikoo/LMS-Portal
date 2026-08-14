"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { parseLmsError, ParsedError } from "@/lib/lms-error-handler";
import { GlobalAlert } from "@/components/ui/global-alert";

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
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : (error as any)?.error || (error as any)?.message || JSON.stringify(error);

    // Use console.warn to prevent Next.js Turbopack dev server error overlays
    console.warn("[LMS Alert System]", errorMessage);

    const parsed = parseLmsError(error);
    if (customTitle) parsed.title = customTitle;

    // Standardize title for generic server/operation failures
    if (parsed.title === "Operation Failed" || parsed.title === "Something Went Wrong") {
      parsed.title = "Notice";
    }

    setErrorState({ parsed, retryFn });
  };

  const clearError = () => setErrorState(null);

  return (
    <ErrorContext.Provider value={{ showError, clearError }}>
      {children}
      {errorState && (
        <GlobalAlert
          isOpen={!!errorState}
          onClose={clearError}
          title={errorState.parsed.title}
          message={errorState.parsed.message}
          type="error"
          variant="modal"
          confirmText={errorState.retryFn && errorState.parsed.isRetryable ? "Try Again" : "Dismiss"}
          onConfirm={
            errorState.retryFn && errorState.parsed.isRetryable
              ? errorState.retryFn
              : undefined
          }
        />
      )}
    </ErrorContext.Provider>
  );
}
