"use client";

import { useState, useEffect } from "react";
import { getDatabaseMetricsAction } from "@/lib/actions/student-actions-optimized";

/**
 * OPTION 2 ARCHITECTURE: "THE MATH" Hook
 * 
 * Fetches server-side database metrics including:
 * - Master student count (unfiltered, includes shadow data)
 * - Per-college student counts (grouped by collegeId and collegeName)
 * - Unassigned students count
 * 
 * This is the SOURCE OF TRUTH for all student counts in the portal.
 * Never use client-side .filter().length for total counts.
 * 
 * Usage:
 * - Dashboard cards
 * - College cards
 * - Any component displaying total counts
 */
export function useDatabaseMetrics() {
  const [masterStudentCount, setMasterStudentCount] = useState(0);
  const [collegeStudentCounts, setCollegeStudentCounts] = useState<Record<string, number>>({});
  const [collegeNameCounts, setCollegeNameCounts] = useState<Record<string, number>>({});
  const [unassignedStudents, setUnassignedStudents] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchMetrics() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getDatabaseMetricsAction();

        if (!mounted) return;

        if (!result.success || !result.metrics) {
          throw new Error(result.error || "Failed to fetch metrics");
        }

        const metrics = result.metrics;
        
        setMasterStudentCount(metrics.masterStudentCount);
        setCollegeStudentCounts(metrics.collegeStudentCounts);
        setCollegeNameCounts(metrics.collegeNameCounts || {});
        setUnassignedStudents(metrics.unassignedStudents);

        console.log("[USE_DATABASE_METRICS] Loaded metrics:", {
          masterStudentCount: metrics.masterStudentCount,
          collegesWithCounts: Object.keys(metrics.collegeStudentCounts).length,
          collegeNamesWithCounts: Object.keys(metrics.collegeNameCounts || {}).length,
          unassignedStudents: metrics.unassignedStudents,
        });
      } catch (err: any) {
        console.error("[USE_DATABASE_METRICS] Error:", err);
        if (mounted) {
          setError(err.message || "Failed to fetch database metrics");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchMetrics();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Get student count for a specific college by ID or name
   * Checks both collegeId and collegeName mappings
   */
  const getCollegeStudentCount = (collegeIdOrName: string): number => {
    if (!collegeIdOrName) return 0;
    
    // Try collegeId first
    const byId = collegeStudentCounts[collegeIdOrName];
    if (byId !== undefined) return byId;
    
    // Try collegeName
    const byName = collegeNameCounts[collegeIdOrName];
    if (byName !== undefined) return byName;
    
    // Try case-insensitive collegeName match
    const lowerName = collegeIdOrName.toLowerCase();
    for (const [name, count] of Object.entries(collegeNameCounts)) {
      if (name.toLowerCase() === lowerName) {
        return count;
      }
    }
    
    return 0;
  };

  return {
    masterStudentCount,
    collegeStudentCounts,
    collegeNameCounts,
    unassignedStudents,
    getCollegeStudentCount,
    isLoading,
    error,
  };
}
