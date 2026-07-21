"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SelectOption, Batch, AssignmentTarget, College } from "@/types";
import {
  EMPTY_FILTERS,
  GLOBAL_INSTITUTION_ID,
  type AcademicFilters,
  type AssignmentLevel,
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
  safeDisplayName,
  getExternalInstitutions,
} from "./hierarchy-data";
import { getLMSCache as getHierarchyCache, subscribeToLMSCache as subscribeToHierarchyCache } from "@/lib/data/lms-data-cache";

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
  levels?: string[];
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
    includeExternalInstitutions = true,
  } = options;

  // Detect user role and college for data scoping
  const { userRole, userCollegeId, userCollegeName } = useMemo(() => {
    if (typeof window === "undefined") return { userRole: "admin", userCollegeId: "", userCollegeName: "" };
    try {
      const role = localStorage.getItem("lms_role") || "admin";
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const profile = uStr ? JSON.parse(uStr) : {};
      return { userRole: role, userCollegeId: profile.collegeId || "", userCollegeName: profile.collegeName || "" };
    } catch {
      return { userRole: "admin", userCollegeId: "", userCollegeName: "" };
    }
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Only apply scoped role logic after hydration to prevent mismatches
  const isScopedRole = mounted && (userRole === "college_admin" || userRole === "student");

  const [filters, setLocalFilters] = useState<AcademicFilters>(() => {
    return mergeFilters(EMPTY_FILTERS, initial);
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToHierarchyCache(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const { hierarchy, loading, error, externalInstitutions } = useMemo(
    () => getHierarchyCache(),
    [tick]
  );

  // Auto-lock college for scoped roles when hierarchy loads
  useEffect(() => {
    if (isScopedRole && userCollegeId && hierarchy) {
      setLocalFilters((current) => {
        if (!current.collegeId) {
          return mergeFilters(current, { collegeId: userCollegeId });
        }
        return current;
      });
    }
  }, [isScopedRole, userCollegeId, hierarchy]);

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
    let clearOthers = false;
    try {
      clearOthers = typeof window !== "undefined" && localStorage.getItem("lms_disable_remaining_filters") === "true";
    } catch {}

    setLocalFilters((current) =>
      mergeFilters(
        current,
        clearOthers
          ? {
              batchId,
              collegeId: "",
              department: "",
              academicYear: "",
              section: "",
              studentId: "",
            }
          : {
              batchId,
              studentId: "",
            }
      )
    );
  }, []);

  const setStudent = useCallback((studentId: string) => {
    setLocalFilters((current) => mergeFilters(current, { studentId }));
  }, []);

  const reset = useCallback(() => {
    const base = { ...EMPTY_FILTERS };
    // Scoped roles keep their college locked even on reset
    if (isScopedRole && userCollegeId) {
      base.collegeId = userCollegeId;
    }
    setLocalFilters(base);
  }, [isScopedRole, userCollegeId]);

  // Institution options: for scoped roles, only show their own college
  const institutionOptions = useMemo<SelectOption[]>(() => {
    if (isScopedRole && hierarchy) {
      // Only show the user's own college
      let myCollege: College | undefined = hierarchy.colleges.find((c) => c.id === userCollegeId);
      if (!myCollege) {
        myCollege = getExternalInstitutions(hierarchy).find((c) => c.id === userCollegeId) as unknown as College;
      }
      if (myCollege) {
        return [{ label: safeDisplayName(myCollege.name, myCollege.id, "My Institution"), value: myCollege.id }];
      }
      if (userCollegeId) {
        return [{ label: safeDisplayName(userCollegeName, userCollegeId, "My Institution"), value: userCollegeId }];
      }
      return [ALL_OPTION];
    }
    return [ALL_OPTION, ...buildInstitutionOptions(hierarchy, { includeExternalInstitutions })];
  }, [hierarchy, includeExternalInstitutions, isScopedRole, userCollegeId, userCollegeName]);

  // Backward-compatible: only official colleges.
  const collegeOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    if (isScopedRole) {
      let myCollege: College | undefined = hierarchy.colleges.find((c) => c.id === userCollegeId);
      if (!myCollege) {
        myCollege = getExternalInstitutions(hierarchy).find((c) => c.id === userCollegeId) as unknown as College;
      }
      if (myCollege) {
        return [{ label: safeDisplayName(myCollege.name, myCollege.id, "My Institution"), value: myCollege.id }];
      }
      if (userCollegeId) {
        return [{ label: safeDisplayName(userCollegeName, userCollegeId, "My Institution"), value: userCollegeId }];
      }
      return [ALL_OPTION];
    }
    return [
      ALL_OPTION,
      ...hierarchy.colleges.map((c) => {
        return { label: safeDisplayName(c.name, c.id, "Unknown Institution"), value: c.id };
      }),
    ];
  }, [hierarchy, isScopedRole, userCollegeId, userCollegeName]);

  const isGlobal = filters.collegeId === GLOBAL_INSTITUTION_ID;

  const departmentOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    if (!filters.collegeId || isGlobal) return [ALL_OPTION, ...toSelectOptions(getAllDepartments(hierarchy))];
    return [ALL_OPTION, ...toSelectOptions(getDepartmentsForCollege(hierarchy, filters.collegeId))];
  }, [hierarchy, filters.collegeId, isGlobal]);

  const academicYearOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    if (!filters.collegeId || !filters.department || isGlobal) return [ALL_OPTION, ...toSelectOptions(getAllAcademicYears(hierarchy))];
    return [
      ALL_OPTION,
      ...toSelectOptions(getYearsForDepartment(hierarchy, filters.collegeId, filters.department)),
    ];
  }, [hierarchy, filters.collegeId, filters.department, isGlobal]);

  const sectionOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    if (!filters.collegeId || !filters.department || !filters.academicYear || isGlobal) {
      return [ALL_OPTION, ...toSelectOptions(getAllSections(hierarchy))];
    }
    return [
      ALL_OPTION,
      ...toSelectOptions(
        getSectionsForYear(hierarchy, filters.collegeId, filters.department, filters.academicYear)
      ),
    ];
  }, [hierarchy, filters.collegeId, filters.department, filters.academicYear, isGlobal]);

  const batchOptions = useMemo<SelectOption[]>(() => {
    if (!hierarchy) return [ALL_OPTION];
    const list = hierarchy.batches.filter((b) => {
      if (filters.collegeId && filters.collegeId !== GLOBAL_INSTITUTION_ID && b.collegeId && b.collegeId !== filters.collegeId) return false;
      if (filters.department && b.department && b.department !== filters.department) return false;
      if (filters.academicYear && b.academicYear && b.academicYear !== filters.academicYear) return false;
      if (filters.section && b.section && b.section !== filters.section) return false;
      return true;
    });
    const seen = new Set<string>();
    const uniqueList: Batch[] = [];
    list.forEach((b) => {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        uniqueList.push(b);
      }
    });
    return [ALL_OPTION, ...toBatchOptions(uniqueList)];
  }, [hierarchy, filters.collegeId, filters.department, filters.academicYear, filters.section]);

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

    const target: AssignmentTarget = { 
      type: "composite", 
      ids: ["composite"] 
    };
    if (collegeId) target.collegeId = collegeId;
    if (collegeName) target.collegeName = collegeName;
    if (filters.department) target.department = filters.department;
    if (filters.academicYear) target.academicYear = filters.academicYear;
    if (filters.section) target.section = filters.section;
    if (filters.batchId) target.batchId = filters.batchId;
    if (batch?.name) target.batchName = batch.name;
    if (filters.studentId) target.studentId = filters.studentId;
    if (student?.name) target.studentName = student.name;
    return target;
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
