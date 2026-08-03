"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Power } from "lucide-react";

export default function StudentErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("[STUDENT ERROR BOUNDARY]", error);
  }, [error]);

  const handleHardReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    } catch (e) {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full">
            <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Something went wrong!</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            We encountered an unexpected error while loading this page. 
            {error.message ? (
              <span className="block mt-2 font-mono text-xs text-red-500 bg-red-50 dark:bg-red-900/10 p-2 rounded-md truncate">
                {error.message}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <Button 
            onClick={() => reset()} 
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          <Button 
            onClick={handleHardReset} 
            variant="outline" 
            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900 flex items-center justify-center gap-2"
          >
            <Power className="w-4 h-4" />
            Hard Reset (Clear Cache)
          </Button>
        </div>
        
        <p className="text-xs text-slate-400 dark:text-slate-500 pt-2">
          If the problem persists, use Hard Reset to clear corrupted local data. You may need to log in again.
        </p>
      </div>
    </div>
  );
}
