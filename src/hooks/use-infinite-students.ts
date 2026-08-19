"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getStudentsPageAction, type StudentFilters } from "@/lib/actions/student-actions-optimized";

type Student = any;

/**
 * OPTION 2 ARCHITECTURE: "THE LIST" Hook
 * 
 * Uses offset-based pagination with getStudentsPageAction() for simple Load More UX.
 * Complements getDatabaseMetricsAction() which provides THE MATH (counts).
 * 
 * Features:
 * - Automatic initial fetch on mount
 * - Load More button appends new rows
 * - Filter changes reset to page 0
 * - Prevents duplicate fetches during load
 */
export function useInfiniteStudents(filters: StudentFilters = {}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true); // Start true to trigger initial fetch
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  
  const filtersRef = useRef(filters);
  const isLoadingRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const take = 100; // Fixed page size

  // Load page function
  const loadPage = useCallback(async (currentSkip: number, isInitial: boolean = false) => {
    if (isLoadingRef.current) {
      console.log("[USE_INFINITE_STUDENTS] Already loading, skipping duplicate fetch");
      return;
    }
    
    console.log(`[USE_INFINITE_STUDENTS] Loading page - skip: ${currentSkip}, isInitial: ${isInitial}`);
    
    isLoadingRef.current = true;
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const result = await getStudentsPageAction(filtersRef.current, currentSkip, take);
      
      if (!result.success) {
        throw new Error(result.error || "Failed to load students");
      }

      const { students: newStudents, total: newTotal, hasMore: more } = result;

      console.log(`[USE_INFINITE_STUDENTS] Loaded ${newStudents.length} students, total: ${newTotal}, hasMore: ${more}`);

      setStudents(prev => currentSkip === 0 ? newStudents : [...prev, ...newStudents]);
      setTotal(newTotal);
      setHasMore(more);
      setSkip(currentSkip);
      hasFetchedRef.current = true;
    } catch (err: any) {
      console.error("[USE_INFINITE_STUDENTS] Error:", err);
      setError(err.message || "Failed to load students");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [take]);

  // Reset and reload when filters change
  useEffect(() => {
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(filtersRef.current);
    
    if (filtersChanged) {
      console.log("[USE_INFINITE_STUDENTS] Filters changed, resetting");
      filtersRef.current = filters;
      setStudents([]);
      setSkip(0);
      setHasMore(true);
      setError(null);
      hasFetchedRef.current = false;
      loadPage(0, true);
    }
  }, [filters, loadPage]);

  // CRITICAL FIX: Fetch initial data on mount
  useEffect(() => {
    if (!hasFetchedRef.current && !isLoadingRef.current) {
      console.log("[USE_INFINITE_STUDENTS] Initial mount, loading first page");
      loadPage(0, true);
    }
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingRef.current) {
      console.log("[USE_INFINITE_STUDENTS] Cannot load more - hasMore:", hasMore, "isLoading:", isLoadingRef.current);
      return;
    }
    const nextSkip = skip + take;
    console.log("[USE_INFINITE_STUDENTS] Load More clicked, next skip:", nextSkip);
    loadPage(nextSkip, false);
  }, [skip, hasMore, take, loadPage]);

  const refresh = useCallback(() => {
    console.log("[USE_INFINITE_STUDENTS] Refresh triggered");
    setStudents([]);
    setSkip(0);
    setHasMore(true);
    setError(null);
    hasFetchedRef.current = false;
    loadPage(0, true);
  }, [loadPage]);

  return {
    students,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
