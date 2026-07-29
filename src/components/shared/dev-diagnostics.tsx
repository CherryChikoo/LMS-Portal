"use client";

import { useEffect, useState } from "react";
import { firestoreDiagnostics } from "@/lib/firebase/diagnostics";

export function DevDiagnostics() {
  const [stats, setStats] = useState(firestoreDiagnostics.getStats());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const interval = setInterval(() => {
      setStats(firestoreDiagnostics.getStats());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== "development") return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-black/80 text-green-400 font-mono text-[10px] px-2 py-1 rounded shadow-lg z-50 hover:bg-black"
      >
        DEV STATS
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-green-400 font-mono text-[11px] p-3 rounded-lg shadow-xl z-50 border border-green-500/30 w-48 backdrop-blur-sm">
      <div className="flex justify-between items-center mb-2 border-b border-green-500/30 pb-1">
        <span className="font-bold">Firestore Stats</span>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Active Listeners:</span>
          <span>{stats.listeners}</span>
        </div>
        <div className="flex justify-between">
          <span>getDoc Calls:</span>
          <span>{stats.getDoc}</span>
        </div>
        <div className="flex justify-between">
          <span>getDocs Calls:</span>
          <span>{stats.getDocs}</span>
        </div>
      </div>
    </div>
  );
}
