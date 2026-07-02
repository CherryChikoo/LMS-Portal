"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full items-center justify-center p-4 bg-zinc-950 text-white font-mono">
      <div className="max-w-2xl w-full p-6 border border-red-500/30 bg-red-500/10 rounded-lg overflow-auto">
        <h2 className="text-xl font-bold text-red-500 mb-4">Application Error</h2>
        <p className="text-sm text-red-400 mb-2">Message: {error.message}</p>
        {error.stack && (
          <pre className="text-xs text-zinc-400 whitespace-pre-wrap p-4 bg-black/50 rounded-md">
            {error.stack}
          </pre>
        )}
        <button
          onClick={() => reset()}
          className="mt-6 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
