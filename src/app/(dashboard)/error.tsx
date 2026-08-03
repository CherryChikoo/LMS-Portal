"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Power } from "lucide-react";

export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("[DASHBOARD ERROR BOUNDARY]", error);
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
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 space-y-8 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-md w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-8">
        <div className="bg-amber-100 dark:bg-amber-900/30 p-4 rounded-full ring-4 ring-amber-50 dark:ring-amber-900/10">
          <AlertTriangle className="w-10 h-10 text-amber-600 dark:text-amber-500" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Dashboard Error Encountered
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            The application state became unstable. This can happen if the cache gets corrupted or network issues occur.
          </p>
          
          {error.message && (
            <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-900 rounded-md text-left overflow-hidden">
              <p className="text-xs font-mono text-slate-700 dark:text-slate-400 truncate">
                {error.message}
              </p>
            </div>
          )}
        </div>

        <div className="w-full grid gap-3 pt-6">
          <Button 
            onClick={() => reset()} 
            className="w-full flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reload React Tree
          </Button>
          
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink-0 mx-4 text-xs text-slate-400">OR</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>
          
          <Button 
            onClick={handleHardReset} 
            variant="destructive" 
            className="w-full flex items-center justify-center gap-2"
          >
            <Power className="w-4 h-4" />
            Hard Reset (Wipe Local Storage)
          </Button>
        </div>
      </div>
    </div>
  );
}
