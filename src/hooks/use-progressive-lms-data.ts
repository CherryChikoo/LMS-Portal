"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchLMSInitialStateAction,
  fetchRemainingStudentsAction,
} from "@/lib/actions/progressive-lms-actions";

type Student = any; // Use your actual Student type
type LMSData = {
  colleges: any[];
  batches: any[];
  students: Student[];
  exams: any[];
  resources: any[];
  attempts: any[];
  metadata?: {
    counts: {
      colleges: number;
      students: number;
      batches: number;
      exams: number;
      resources: number;
    };
    studentsLoaded: number;
    studentsTotal: number;
  };
};

// In-memory cache with 5 minute TTL
const CACHE_TTL = 5 * 60 * 1000;
let cachedData: LMSData | null = null;
let cacheTimestamp = 0;

export function useProgressiveLMSData() {
  const [data, setData] = useState<LMSData | null>(cachedData);
  const [isLoading, setIsLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const isLoadingRef = useRef(false);
  const allStudentsLoadedRef = useRef(false);

  // Load initial data (fast - only 100 students)
  const loadInitialData = useCallback(async () => {
    // Check cache first
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
      setData(cachedData);
      setIsLoading(false);
      setLoadProgress(100);
      
      // If cache is not complete, continue loading in background
      if (
        cachedData.metadata &&
        cachedData.students.length < cachedData.metadata.studentsTotal
      ) {
        loadRemainingStudents(cachedData.students.length);
      }
      return;
    }

    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      const result = await fetchLMSInitialStateAction();

      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to load data");
      }

      // Update cache
      cachedData = result.data;
      cacheTimestamp = Date.now();
      
      setData(result.data);
      
      // Calculate initial progress
      const totalStudents = result.data.metadata?.studentsTotal || 0;
      const loadedStudents = result.data.students.length;
      setLoadProgress(totalStudents > 0 ? (loadedStudents / totalStudents) * 100 : 100);
      
      setIsLoading(false);

      // Start loading remaining students in background
      if (loadedStudents < totalStudents) {
        loadRemainingStudents(loadedStudents);
      } else {
        allStudentsLoadedRef.current = true;
      }
    } catch (err: any) {
      console.error("[USE_PROGRESSIVE_LMS] Initial load failed:", err);
      setError(err.message || "Failed to load data");
      setIsLoading(false);
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  // Load remaining students progressively in background
  const loadRemainingStudents = useCallback(async (currentSkip: number) => {
    if (allStudentsLoadedRef.current || !cachedData) return;

    setIsLoadingMore(true);

    try {
      const result = await fetchRemainingStudentsAction(currentSkip);

      if (!result.success || !result.data) {
        console.error("[USE_PROGRESSIVE_LMS] Background load failed:", result.error);
        return;
      }

      if (result.data.students.length === 0) {
        allStudentsLoadedRef.current = true;
        setLoadProgress(100);
        setIsLoadingMore(false);
        return;
      }

      // Append new students to cache and state
      const updatedStudents = [...cachedData.students, ...result.data.students];
      cachedData = {
        ...cachedData,
        students: updatedStudents,
      };
      cacheTimestamp = Date.now();

      setData({ ...cachedData });

      // Update progress
      const totalStudents = cachedData.metadata?.studentsTotal || 0;
      const loadedStudents = updatedStudents.length;
      setLoadProgress(totalStudents > 0 ? (loadedStudents / totalStudents) * 100 : 100);

      // Continue loading if there's more
      if (result.data.hasMore) {
        // Use requestIdleCallback for better performance
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          (window as any).requestIdleCallback(() => {
            loadRemainingStudents(result.data.nextSkip);
          });
        } else {
          setTimeout(() => {
            loadRemainingStudents(result.data.nextSkip);
          }, 100);
        }
      } else {
        allStudentsLoadedRef.current = true;
        setLoadProgress(100);
        setIsLoadingMore(false);
      }
    } catch (err: any) {
      console.error("[USE_PROGRESSIVE_LMS] Background load error:", err);
      setIsLoadingMore(false);
    }
  }, []);

  // Invalidate cache and reload
  const refresh = useCallback(async () => {
    cachedData = null;
    cacheTimestamp = 0;
    allStudentsLoadedRef.current = false;
    await loadInitialData();
  }, [loadInitialData]);

  // Load on mount
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return {
    data,
    isLoading,
    isLoadingMore,
    error,
    loadProgress,
    refresh,
    allStudentsLoaded: allStudentsLoadedRef.current,
  };
}
