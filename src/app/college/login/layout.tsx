"use client";

import { type ReactNode } from "react";

export default function CollegeLoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden bg-background">
      {/* Background ambient mesh for College (Blue & Cyan) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-cyan-600/15 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-[1100px] z-10">
        {children}
      </div>
    </div>
  );
}
