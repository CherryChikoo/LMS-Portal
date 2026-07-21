"use client";

import { useEffect, useState } from "react";
import { subscribeToLMSCache, getLMSCache, type LMSDataCacheState } from "./lms-data-cache";

export function useLMSData() {
  const [data, setData] = useState(() => getLMSCache());

  useEffect(() => {
    // Subscribe to the global cache on mount
    const unsubscribe = subscribeToLMSCache(() => {
      // The cache updates its own internal singleton state and calls our callback
      // We force a re-render with the new state
      setData(getLMSCache());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return data;
}
