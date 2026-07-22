"use client";

import { type ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 lg:p-6 relative overflow-x-hidden overflow-y-auto bg-background">
      {/* Background ambient mesh */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-[1100px] z-10">
        {children}
      </div>
    </div>
  );
}
