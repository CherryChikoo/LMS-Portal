"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SelectOption, Batch } from "@/types";
import {
  EMPTY_FILTERS,
  GLOBAL_INSTITUTION_ID,
  type AcademicFilters,
  type AssignmentLevel,
  type AssignmentTarget,
  type Hierarchy,
  type Institution,
  getDepartmentsForCollege,
  getYearsForDepartment,
  getSectionsForYear,
  getBatchesForSection,
  getStudentsForBatch,
  toSelectOptions,
  toBatchOptions,
  toStudentOptions,
  getCollegeName,
  getInstitutionName as resolveInstitutionName,
  buildInstitutionOptions,
  getAllDepartments,
  getAllAcademicYears,
  getAllSections,
} from "./hierarchy-data";
import { getHierarchyCache, subscribeToHierarchyCache } from "./hierarchy-cache";

export type AcademicHierarchyLevel =
  | "institution"
  | "college"
  | "department"
  | "academicYear"
  | "section"
  | "batch"
  | "student";

export interface UseAcademicHierarchyOptions {
  initial?: Partial<AcademicFilters>;
  levels?: AcademicHierarchyLevel[];
  includeGlobal?: boolean;
  includeExternalInstitutions?: boolean;
}

export interface UseAcademicHierarchyResult {
  hierarchy: Hierarchy | null;
  filters: AcademicFilters;
  setFilters: (filters: Partial<AcademicFilters>) => void;
  setCollege: (collegeId: string) => void;
  setDepartment: (department: string) => void;
  setAcademicYear: (academicYear: string) => void;
  setSection: (section: string) => void;
  setBatch: (batchId: string) => void;
  setStudent: (studentId: string) => void;
  reset: () => void;
  institutionOptions: SelectOption[];
  collegeOptions: SelectOption[];
  departmentOptions: SelectOption[];
  academicYearOptions: SelectOption[];
  sectionOptions: SelectOption[];
  batchOptions: SelectOption[];
  studentOptions: SelectOption[];
  loading: boolean;
  error: Error | null;
  getCollegeName: (collegeId: string) => string;
  getInstitutionName: (id: string) => string;
  externalInstitutions: Institution[];
  buildAssignmentTarget: () => AssignmentTarget;
}

const ALL_OPTION: SelectOption = { label: "All", value: "" };

function mergeFilters(current: AcademicFilters, next: Partial<AcademicFilters>): AcademicFilters {
  return { ...current, ...next };
}

export function useAcademicHierarchy(options: UseAcademicHierarchyOptions = {}): UseAcademicHierarchyResult {
  const {
    initial = {},
    includeGlobal = true,
    includeExternalInstitutions = true,
  } = options;

  const [filters, setLocalFilters] = useState<AcademicFilters>(() =>
    mergeFilters(EMPTY_FILTERS, initial)
  );
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToHierarchyCache(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const { hierarchy, loading, error, externalInstitutions } = useMemo(
    () => getHierarchyCache(),
    []
  );

  const setFilters = useCallback((next: Partial<AcademicFilters>) => {
    setLocalFilters((current) => mergeFilters(current, next));
  }, []);

  const setCollege = useCallback(
    (collegeId: string) => {
      setLocalFilters((current) =>
        mergeFilters(current, {
          collegeId,
          department: "",
          academicYear: "",
          section: "",
          batchId: "",
          studentId: "",
        })
      );
    },
    []
  );

  const setDepartment = useCallback((department: string) => {
    setLocalFilters((current) =>
      mergeFilters(current, {
        department,
        academicYear: "",
        section: "",
        batchId: "",
        studentId: "",
      })
    );
  }, []);

  const setAcademicYear = useCallback((academicYear: string) => {
    setLocalFilters((current) =>
      mergeFilters(current, {
        academicYear,
        section: "",
        batchId: "",
        studentId: "",
      })
    );
  }, []);

  const setSection = useCallback((section: string) => {
    setLocalFilters((current) =>
      mergeFilters(current, {
        section,
        batchId: "",
        studentId: "",
      })
    );
  }, []);

  const setBatch = useCallback((batchId: string) => {
    setLocalFilters((current) =>
      mergeFilters(current, {
        batchId,
        studentId: "",
      })
    );
  }, []);

  const setStudent = useCallback((studentId: string) => {
    setLocalFilters((current) => mergeFilters(current, { studentId }));
  }, []);

  const reset = useCallback(() => {
    setLocalFilters(EMPTY_FILTERS);
  }, []);

  // Unified institution options (official + external + optional GLOBAL).
  const institutionOptions = useMemo<SelectOption[]>(() => {
    return [ALL_OPTION, ...buildInstitutionOptions(hierarchy, { includeGlobal, includeExternalInstitutions })];
  }, [hierarchy, includeGlobal, includeExternalInstitutions]);

  // Backward-compatible: only official colleges.
  const collegeOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    return [ALL_OPTION, ...hierarchy.colleges.map((c) => ({ label: c.name, value: c.id }))];
  }, [hierarchy]);

  const isGlobal = filters.collegeId === GLOBAL_INSTITUTION_ID;

  const departmentOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy || !filters.collegeId) return [ALL_OPTION];
    if (isGlobal) return [ALL_OPTION, ...toSelectOptions(getAllDepartments(hierarchy))];
    return [ALL_OPTION, ...toSelectOptions(getDepartmentsForCollege(hierarchy, filters.collegeId))];
  }, [hierarchy, filters.collegeId, isGlobal]);

  const academicYearOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy || !filters.collegeId || !filters.department) return [ALL_OPTION];
    if (isGlobal) return [ALL_OPTION, ...toSelectOptions(getAllAcademicYears(hierarchy))];
    return [
      ALL_OPTION,
      ...toSelectOptions(getYearsForDepartment(hierarchy, filters.collegeId, filters.department)),
    ];
  }, [hierarchy, filters.collegeId, filters.department, isGlobal]);

  const sectionOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy || !filters.collegeId || !filters.department || !filters.academicYear) {
      return [ALL_OPTION];
    }
    if (isGlobal) return [ALL_OPTION, ...toSelectOptions(getAllSections(hierarchy))];
    return [
      ALL_OPTION,
      ...toSelectOptions(
        getSectionsForYear(hierarchy, filters.collegeId, filters.department, filters.academicYear)
      ),
    ];
  }, [hierarchy, filters.collegeId, filters.department, filters.academicYear, isGlobal]);

  const batchOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    if (!filters.collegeId || !filters.department || !filters.academicYear || !filters.section) {
      return [ALL_OPTION];
    }
    if (isGlobal) {
      // GLOBAL + full drill-down -> aggregate batches across all colleges.
      const seen = new Set<string>();
      const list: Batch[] = [];
      hierarchy.batches.forEach((b) => {
        if (seen.has(b.id)) return;
        seen.add(b.id);
        list.push(b);
      });
      return [ALL_OPTION, ...toBatchOptions(list)];
    }
    return [
      ALL_OPTION,
      ...toBatchOptions(
        getBatchesForSection(
          hierarchy,
          filters.collegeId,
          filters.department,
          filters.academicYear,
          filters.section
        )
      ),
    ];
  }, [hierarchy, filters.collegeId, filters.department, filters.academicYear, filters.section, isGlobal]);

  const studentOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    if (filters.batchId) {
      return [ALL_OPTION, ...toStudentOptions(getStudentsForBatch(hierarchy, filters.batchId))];
    }
    if (isGlobal && !filters.collegeId) {
      return [ALL_OPTION, ...toStudentOptions(hierarchy.students)];
    }
    return [ALL_OPTION];
  }, [hierarchy, filters.batchId, filters.collegeId, isGlobal]);

  // For students cascading without a batch: derive matching students from
  // the current hierarchy filters. Exposed indirectly via studentOptions when
  // a batch is selected. The invalidation effect below also guards children.

  // Determine the most specific assignment level matching the current filters.
  const buildAssignmentTarget = useCallback((): AssignmentTarget => {
    const collegeId = filters.collegeId;
    const collegeName = collegeId
      ? hierarchy?.collegeMap.get(collegeId)?.name || resolveInstitutionName(hierarchy, collegeId)
      : undefined;

    let level: AssignmentLevel = "global";
    if (filters.studentId) level = "student";
    else if (filters.batchId) level = "batch";
    else if (filters.section) level = "section";
    else if (filters.academicYear) level = "academicYear";
    else if (filters.department) level = "department";
    else if (collegeId) {
      level = collegeId === GLOBAL_INSTITUTION_ID ? "global" : "institution";
    }

    const batch = filters.batchId ? hierarchy?.batchMap.get(filters.batchId) : undefined;
    const student = filters.studentId
      ? hierarchy?.students.find((s) => s.id === filters.studentId)
      : undefined;

    return {
      level,
      collegeId: collegeId || undefined,
      collegeName,
      department: filters.department || undefined,
      academicYear: filters.academicYear || undefined,
      section: filters.section || undefined,
      batchId: filters.batchId || undefined,
      batchName: batch?.name,
      studentId: filters.studentId || undefined,
      studentName: student?.name,
    };
  }, [
    filters.collegeId,
    filters.department,
    filters.academicYear,
    filters.section,
    filters.batchId,
    filters.studentId,
    hierarchy,
  ]);

  // Ensure child selections are valid whenever the parent selection changes.
  // Because setters above reset children immediately, this catches stale values
  // caused by external data changes (e.g., a batch was deleted).
  useEffect(() => {
    if (!hierarchy) return;

    const invalidations: Partial<AcademicFilters> = {};

    if (filters.department && !departmentOptions.some((o) => o.value === filters.department)) {
      invalidations.department = "";
      invalidations.academicYear = "";
      invalidations.section = "";
      invalidations.batchId = "";
      invalidations.studentId = "";
    }

    if (filters.academicYear && !academicYearOptions.some((o) => o.value === filters.academicYear)) {
      invalidations.academicYear = "";
      invalidations.section = "";
      invalidations.batchId = "";
      invalidations.studentId = "";
    }

    if (filters.section && !sectionOptions.some((o) => o.value === filters.section)) {
      invalidations.section = "";
      invalidations.batchId = "";
      invalidations.studentId = "";
    }

    if (filters.batchId && !batchOptions.some((o) => o.value === filters.batchId)) {
      invalidations.batchId = "";
      invalidations.studentId = "";
    }

    if (filters.studentId && !studentOptions.some((o) => o.value === filters.studentId)) {
      invalidations.studentId = "";
    }

    if (Object.keys(invalidations).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cascading reset: child filters must reset when parent filter data changes
      setLocalFilters((current) => mergeFilters(current, invalidations));
    }
  }, [
    hierarchy,
    filters.department,
    filters.academicYear,
    filters.section,
    filters.batchId,
    filters.studentId,
    departmentOptions,
    academicYearOptions,
    sectionOptions,
    batchOptions,
    studentOptions,
  ]);

  return {
    hierarchy,
    filters,
    setFilters,
    setCollege,
    setDepartment,
    setAcademicYear,
    setSection,
    setBatch,
    setStudent,
    reset,
    institutionOptions,
    collegeOptions,
    departmentOptions,
    academicYearOptions,
    sectionOptions,
    batchOptions,
    studentOptions,
    loading,
    error,
    getCollegeName: (collegeId: string) => getCollegeName(hierarchy, collegeId),
    getInstitutionName: (id: string) => resolveInstitutionName(hierarchy, id),
    externalInstitutions,
    buildAssignmentTarget,
  };
}
