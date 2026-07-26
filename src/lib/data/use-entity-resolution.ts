"use client";

import { useMemo } from "react";
import { useLMSData } from "./use-lms-data";
import { resolveEntity } from "@/lib/utils/resolveEntity";
import type { Student } from "@/types";

export function useEntityResolution() {
  const { 
    filteredColleges, 
    filteredBatches, 
    filteredStudents, 
    filteredExams, 
    filteredResources,
    hierarchy,
    institutions,
    rawColleges
  } = useLMSData();

  return useMemo(() => ({
    resolveInstitution: (id: string | number | undefined | null): string => {
      if (!id || String(id) === "ALL" || String(id) === "GLOBAL") return String(id) === "ALL" ? "All Institutions" : "Global";
      
      const sourceColleges = rawColleges?.length > 0 ? rawColleges : (institutions || hierarchy?.colleges || filteredColleges || []);
      const resolved = resolveEntity(sourceColleges, id, "Institution");
      return resolved.name;
    },
    
    resolveBatch: (id: string | number | undefined | null): string => {
      if (!id || String(id) === "ALL" || String(id) === "GLOBAL") return String(id) === "ALL" ? "All Batches" : "Global";
      
      const sourceBatches = hierarchy?.batches || filteredBatches || [];
      const resolved = resolveEntity(sourceBatches, id, "Batch");
      return resolved.name;
    },
    
    resolveStudent: (id: string | number | undefined | null): string => {
      if (!id) return "Unknown Student";
      
      const sourceStudents = hierarchy?.students || filteredStudents || [];
      const resolved = resolveEntity(sourceStudents, id, "Student");
      
      // Fallback for email matching legacy systems
      if (!resolved.isResolved) {
        const foundByEmail = (sourceStudents as Student[]).find((s: Student) => s.email && String(s.email).toLowerCase() === String(id).toLowerCase());
        if (foundByEmail) {
          const isDeleted = foundByEmail.isDeleted === true || foundByEmail.status === 'deleted';
          return isDeleted ? `${foundByEmail.name} (Deleted)` : foundByEmail.name;
        }
      }
      
      return resolved.name;
    },
    
    resolveExam: (id: string | number | undefined | null): string => {
      if (!id) return "Unknown Assessment";
      const resolved = resolveEntity(filteredExams || [], id, "Assessment");
      // Use "title" instead of "name" for exams/resources if they don't have "name"
      if (resolved.isResolved && !resolved.rawData.name && resolved.rawData.title) {
        return resolved.isDeleted ? `${resolved.rawData.title} (Deleted)` : resolved.rawData.title;
      }
      return resolved.name;
    },
    
    resolveResource: (id: string | number | undefined | null): string => {
      if (!id) return "Unknown Resource";
      const resolved = resolveEntity(filteredResources || [], id, "Resource");
      if (resolved.isResolved && !resolved.rawData.name && resolved.rawData.title) {
        return resolved.isDeleted ? `${resolved.rawData.title} (Deleted)` : resolved.rawData.title;
      }
      return resolved.name;
    }
  }), [rawColleges, filteredColleges, filteredBatches, filteredStudents, filteredExams, filteredResources, hierarchy, institutions]);
}
