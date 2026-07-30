"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard Error Boundary]", error);
  }, [error]);

  return (
    <div className="w-full py-16 px-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-[#0d0e12] border border-white/10 rounded-2xl md:rounded-3xl p-6 sm:p-7 shadow-2xl text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white">Dashboard Error</h2>
          <p className="text-xs text-white/70 leading-relaxed">
            Failed to load dashboard content. Please try again.
          </p>
        </div>
        <Button
          onClick={() => reset()}
          className="w-full h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-all border border-white/10 flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reload Section</span>
        </Button>
      </div>
    </div>
  );
}
