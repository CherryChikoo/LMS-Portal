"use client";

import { useEffect, useState } from "react";
import { subscribeToLMSCache, getLMSCache } from "./lms-data-cache";
import { useLMSStoreSelector, type LMSStoreState } from "./lms-store";

/**
 * Legacy full-data hook. Re-renders on any cache update.
 */
export function useLMSData() {
  const [data, setData] = useState(() => getLMSCache());

  useEffect(() => {
    const unsubscribe = subscribeToLMSCache(() => {
      setData(getLMSCache());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return data;
}

/**
 * Fine-grained selector hook. Re-renders ONLY when the selected state slice changes.
 * Example: `const students = useLMSDataSelector(s => s.filteredStudents);`
 */
export function useLMSDataSelector<T>(selector: (state: LMSStoreState) => T): T {
  useEffect(() => {
    // Ensure cache listeners start if not already active
    const unsubscribe = subscribeToLMSCache(() => {});
    return () => {
      unsubscribe();
    };
  }, []);

  return useLMSStoreSelector(selector);
}
