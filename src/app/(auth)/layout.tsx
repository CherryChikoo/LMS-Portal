"use client";

import { type ReactNode } from "react";

import { usePathname } from "next/navigation";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isRegister = pathname === "/register";

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 lg:p-6 relative overflow-x-hidden overflow-y-auto bg-[#0a0a0c] text-white">
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Deep base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-[#0a0a0c]" />
        
        {/* Animated glowing blobs */}
        <div className="absolute -top-1/4 -left-1/4 w-[70vw] h-[70vw] bg-brand/20 rounded-full blur-[140px] opacity-60 animate-[spin_40s_linear_infinite]" />
        <div className="absolute top-1/4 -right-1/4 w-[60vw] h-[60vw] bg-indigo-600/20 rounded-full blur-[120px] opacity-50 animate-[spin_30s_reverse_linear_infinite]" />
        <div className="absolute -bottom-1/4 left-1/3 w-[80vw] h-[80vw] bg-violet-800/10 rounded-full blur-[160px] opacity-50 animate-[pulse_10s_ease-in-out_infinite]" />
        
        {/* Glass overlay with subtle noise/frost */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[60px]" style={{ mixBlendMode: 'overlay' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>

      <div className={`w-full z-10 relative ${isRegister ? "max-w-[1000px]" : "max-w-[420px]"}`}>
        {children}
      </div>
    </div>
  );
}
