import type { College, Batch, Student, SelectOption } from "@/types";

export interface AcademicFilters {
  collegeId: string;
  department: string;
  academicYear: string;
  section: string;
  batchId: string;
  studentId: string;
  batchOnlyMode?: boolean;
}

/**
 * A unified institution can be:
 * - "official": a college created by an admin/trainer (in `colleges` collection)
 * - "external": a self-registered institution (no `colleges` doc, but referenced by students)
 * - "global": the catch-all institution that targets every student
 */
export interface Institution {
  id: string;
  name: string;
  type: "official" | "external" | "global";
  code?: string;
  departments?: string[];
  isDeleted?: boolean;
  studentCount?: number;
  isPromoted?: boolean;
}

export const GLOBAL_INSTITUTION_ID = "GLOBAL";

/**
 * Assignment targeting levels supported by the unified hierarchy.
 * - "global" targets every student
 * - "institution" targets all students at a given college
 * - the remaining levels cascade from institution
 */
export type AssignmentLevel =
  | "global"
  | "institution"
  | "department"
  | "academicYear"
  | "section"
  | "batch"
  | "student";

export interface AssignmentTarget {
  level: AssignmentLevel;
  collegeId?: string;
  collegeName?: string;
  department?: string;
  academicYear?: string;
  section?: string;
  batchId?: string;
  batchName?: string;
  studentId?: string;
  studentName?: string;
}

export const EMPTY_FILTERS: AcademicFilters = {
  collegeId: "",
  department: "",
  academicYear: "",
  section: "",
  batchId: "",
  studentId: "",
  batchOnlyMode: false,
};

export interface Hierarchy {
  colleges: College[];
  batches: Batch[];
  students: Student[];
  collegeMap: Map<string, College>;
  batchMap: Map<string, Batch>;
  departmentsByCollege: Map<string, string[]>;
  yearsByCollegeDept: Map<string, string[]>;
  sectionsByCollegeDeptYear: Map<string, string[]>;
  batchesByKey: Map<string, Batch[]>;
  studentsByBatch: Map<string, Student[]>;
}

function normalize(val: unknown): string {
  return String(val ?? "").trim();
}

function key(...parts: (string | null | undefined)[]): string {
  return parts.map(normalize).map((p) => (p === "" ? "*" : p.toLowerCase())).join("::");
}

/**
 * Detects strings that look like raw Firestore document IDs.
 * Firestore auto-generated IDs are 20 characters of [A-Za-z0-9].
 * This heuristic catches IDs with 15+ alphanumeric chars and mixed case.
 */
export function looksLikeFirestoreId(str: string): boolean {
  if (!str) return false;
  const s = str.trim();
  // Firestore auto-generated IDs are exactly 20 chars. Auth UIDs are exactly 28 chars.
  if (s.length !== 20 && s.length !== 28) return false;
  
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return false;

  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  const hasNumber = /[0-9]/.test(s);
  
  // Must have at least 2 types of characters (high entropy)
  const typesCount = (hasLower ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNumber ? 1 : 0);
  
  return typesCount >= 2;
}

/**
 * Returns a safe display name. If the name looks like a Firestore ID or
 * is missing/identical to the raw id, returns the provided fallback.
 */
export function safeDisplayName(name: string | undefined | null, id: string, fallback = "Unknown"): string {
  if (!name) return fallback;
  const trimmedName = name.trim();
  const trimmedId = (id || "").trim();
  
  // If name looks like an ID, use fallback.
  if (looksLikeFirestoreId(trimmedName)) {
    return fallback;
  }
  
  // If name matches ID, but it DOESN'T look like a Firestore ID,
  // it's probably a manual external institution where ID = Name.
  // We can safely return the name.

  return trimmedName;

  return trimmedName;
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const k = v.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function buildInstitutionOptions(institutions: Institution[]): SelectOption[];
export function buildInstitutionOptions(
  hierarchy: Hierarchy | null,
  options?: { includeGlobal?: boolean; includeExternalInstitutions?: boolean }
): SelectOption[];
export function buildInstitutionOptions(
  input: Institution[] | Hierarchy | null,
  options: { includeGlobal?: boolean; includeExternalInstitutions?: boolean } = {}
): SelectOption[] {
  if (Array.isArray(input)) {
    return input.map((inst) => {
      const display = safeDisplayName(inst.name, inst.id, "Unknown Institution");
      return inst.isDeleted
        ? { label: `${display} (Deleted)`, value: inst.id }
        : { label: display, value: inst.id };
    });
  }

  const hierarchy = input;
  const { includeGlobal = true, includeExternalInstitutions = true } = options;
  if (!hierarchy) return [];

  const out: SelectOption[] = [];

  hierarchy.colleges.forEach((c) => {
    const display = safeDisplayName(c.name, c.id, "Unknown Institution");
    out.push({ label: c.isDeleted ? `${display} (Deleted)` : display, value: c.id });
  });

  if (includeExternalInstitutions) {
    getExternalInstitutions(hierarchy).forEach((inst) => {
      const display = safeDisplayName(inst.name, inst.id, "Unknown Institution");
      out.push({ label: display, value: inst.id });
    });
  }

  return out;
}

export function buildHierarchy(colleges: College[], batches: Batch[], students: Student[]): Hierarchy {
  const collegeMap = new Map<string, College>();
  colleges.forEach((c) => collegeMap.set(c.id, c));

  const batchMap = new Map<string, Batch>();
  batches.forEach((b) => batchMap.set(b.id, b));

  const departmentsByCollege = new Map<string, string[]>();
  const yearsByCollegeDept = new Map<string, string[]>();
  const sectionsByCollegeDeptYear = new Map<string, string[]>();
  const batchesByKey = new Map<string, Batch[]>();

  // 1. Seed official college departments.
  colleges.forEach((college) => {
    const depts = uniquePreservingOrder((college.departments || []).map(normalize).filter(Boolean));
    departmentsByCollege.set(key(college.id), depts);
  });

  // 2. Derive hierarchy from batches and students, augmenting college departments.
  const allHierarchyRecords: Array<{
    collegeId: string;
    department: string;
    academicYear: string;
    section: string;
    batchId?: string;
  }> = [];

  batches.forEach((b) => {
    const collegeId = normalize(b.collegeId);
    const department = normalize(b.department);
    const academicYear = normalize(b.academicYear);
    const section = normalize(b.section);
    if (!collegeId) return;
    allHierarchyRecords.push({ collegeId, department, academicYear, section, batchId: b.id });

    // Also register the batch under the college alone so it can be discovered even
    // when its department/year/section fields are blank.
    if (!department || !academicYear || !section) {
      allHierarchyRecords.push({ collegeId, department: "", academicYear: "", section: "" });
    }
  });

  students.forEach((s) => {
    const collegeId = normalize(s.collegeId);
    const department = normalize(s.department);
    const academicYear = normalize(s.academicYear);
    const section = normalize(s.section);
    if (!collegeId) return;
    (s.batchIds || []).forEach((batchId) => {
      allHierarchyRecords.push({ collegeId, department, academicYear, section, batchId: normalize(batchId) });
    });
    // Also register the student under the college alone.
    if (!department || !academicYear || !section) {
      allHierarchyRecords.push({ collegeId, department: "", academicYear: "", section: "" });
    }
  });

  allHierarchyRecords.forEach(({ collegeId, department, academicYear, section, batchId }) => {
    const collegeKey = key(collegeId);
    const deptKey = key(collegeId, department);
    const yearKey = key(collegeId, department, academicYear);
    const sectionKey = key(collegeId, department, academicYear, section);

    if (department) {
      const depts = departmentsByCollege.get(collegeKey) || [];
      if (!depts.some((d) => d.toLowerCase() === department.toLowerCase())) {
        departmentsByCollege.set(collegeKey, uniquePreservingOrder([...depts, department]));
      }
    }

    if (department && academicYear) {
      const years = yearsByCollegeDept.get(deptKey) || [];
      if (!years.some((y) => y.toLowerCase() === academicYear.toLowerCase())) {
        yearsByCollegeDept.set(deptKey, uniquePreservingOrder([...years, academicYear]));
      }
    }

    if (department && academicYear && section) {
      const sections = sectionsByCollegeDeptYear.get(yearKey) || [];
      if (!sections.some((sec) => sec.toLowerCase() === section.toLowerCase())) {
        sectionsByCollegeDeptYear.set(yearKey, uniquePreservingOrder([...sections, section]));
      }
    }

    if (batchId) {
      const batch = batchMap.get(batchId);
      if (batch) {
        const list = batchesByKey.get(sectionKey) || [];
        if (!list.some((existing) => existing.id === batch.id)) {
          batchesByKey.set(sectionKey, [...list, batch]);
        }
      }
    }
  });

  // 3. Build student indexes.
  const studentsByBatch = new Map<string, Student[]>();
  const studentsByKey = new Map<string, Student[]>();

  students.forEach((s) => {
    const collegeId = normalize(s.collegeId);
    const department = normalize(s.department);
    const academicYear = normalize(s.academicYear);
    const section = normalize(s.section);
    if (!collegeId) return;

    const studentBatchIds = new Set<string>();
    (s.batchIds || []).forEach((id) => {
      const bid = normalize(id);
      if (bid) studentBatchIds.add(bid);
    });

    // Index by each batch the student belongs to.
    studentBatchIds.forEach((bid) => {
      const list = studentsByBatch.get(bid) || [];
      if (!list.some((existing) => existing.id === s.id)) {
        studentsByBatch.set(bid, [...list, s]);
      }
    });

    // Index by hierarchy key.
    const sectionKey = key(collegeId, department, academicYear, section);
    const list = studentsByKey.get(sectionKey) || [];
    if (!list.some((existing) => existing.id === s.id)) {
      studentsByKey.set(sectionKey, [...list, s]);
    }
  });

  return {
    colleges,
    batches,
    students,
    collegeMap,
    batchMap,
    departmentsByCollege,
    yearsByCollegeDept,
    sectionsByCollegeDeptYear,
    batchesByKey,
    studentsByBatch,
  };
}

export function getDepartmentsForCollege(hierarchy: Hierarchy, collegeId: string): string[] {
  return hierarchy.departmentsByCollege.get(key(collegeId)) || [];
}

export function getYearsForDepartment(hierarchy: Hierarchy, collegeId: string, department: string): string[] {
  return hierarchy.yearsByCollegeDept.get(key(collegeId, department)) || [];
}

export function getSectionsForYear(
  hierarchy: Hierarchy,
  collegeId: string,
  department: string,
  academicYear: string
): string[] {
  return hierarchy.sectionsByCollegeDeptYear.get(key(collegeId, department, academicYear)) || [];
}

export function getBatchesForSection(
  hierarchy: Hierarchy,
  collegeId: string,
  department: string,
  academicYear: string,
  section: string
): Batch[] {
  return hierarchy.batchesByKey.get(key(collegeId, department, academicYear, section)) || [];
}

export function getStudentsForBatch(hierarchy: Hierarchy, batchId: string): Student[] {
  return hierarchy.studentsByBatch.get(batchId) || [];
}

/**
 * Aggregates every distinct department, academic year, or section across all
 * colleges/students. Used when the GLOBAL institution is selected so the user
 * can drill down without first picking a specific college.
 */
function aggregateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  values.forEach((raw) => {
    const v = normalize(raw);
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(v);
  });
  return ordered;
}

export function getAllDepartments(hierarchy: Hierarchy): string[] {
  if (!hierarchy) return [];
  const collected: string[] = [];
  hierarchy.students.forEach((s) => collected.push(s.department));
  hierarchy.colleges.forEach((c) => (c.departments || []).forEach((d) => collected.push(d)));
  return aggregateValues(collected);
}

export function getAllAcademicYears(hierarchy: Hierarchy): string[] {
  if (!hierarchy) return [];
  const collected: string[] = [];
  hierarchy.students.forEach((s) => collected.push(s.academicYear || ""));
  hierarchy.batches.forEach((b) => collected.push(b.academicYear || ""));
  return aggregateValues(collected);
}

export function cleanSectionName(section: string): string {
  if (!section) return "";
  const trimmed = section.trim();
  const match = /^section\s+([a-z0-9]+)$/i.exec(trimmed);
  if (match) return match[1].toUpperCase();
  return trimmed;
}

export function getAllSections(hierarchy: Hierarchy): string[] {
  if (!hierarchy) return [];
  const collected: string[] = [];
  hierarchy.students.forEach((s) => collected.push(cleanSectionName(s.section)));
  hierarchy.batches.forEach((b) => collected.push(cleanSectionName(b.section || "")));
  return aggregateValues(collected);
}

export function getYearsForCollege(hierarchy: Hierarchy, collegeId: string): string[] {
  if (!hierarchy || !collegeId) return [];
  const collected: string[] = [];
  hierarchy.students.forEach((s) => {
    if (s.collegeId === collegeId) collected.push(s.academicYear || "");
  });
  hierarchy.batches.forEach((b) => {
    if (b.collegeId === collegeId) collected.push(b.academicYear || "");
  });
  return aggregateValues(collected);
}

export function getSectionsForCollege(hierarchy: Hierarchy, collegeId: string): string[] {
  if (!hierarchy || !collegeId) return [];
  const collected: string[] = [];
  hierarchy.students.forEach((s) => {
    if (s.collegeId === collegeId) collected.push(cleanSectionName(s.section));
  });
  hierarchy.batches.forEach((b) => {
    if (b.collegeId === collegeId) collected.push(cleanSectionName(b.section || ""));
  });
  return aggregateValues(collected);
}

export function getSectionsForCollegeAndDepartment(hierarchy: Hierarchy, collegeId: string, department: string): string[] {
  if (!hierarchy || !collegeId || !department) return [];
  const collected: string[] = [];
  hierarchy.students.forEach((s) => {
    if (s.collegeId === collegeId && s.department === department) collected.push(cleanSectionName(s.section));
  });
  hierarchy.batches.forEach((b) => {
    if (b.collegeId === collegeId && b.department === department) collected.push(cleanSectionName(b.section || ""));
  });
  return aggregateValues(collected);
}


export function toSelectOptions(values: string[]): SelectOption[] {
  return values.map((v) => {
    const cleaned = cleanSectionName(v);
    const label = looksLikeFirestoreId(cleaned) ? "Unknown" : cleaned;
    return { label, value: v };
  });
}

export function toBatchOptions(batches: Batch[]): SelectOption[] {
  return batches.map((b) => {
    const display = safeDisplayName(b.name, b.id, "Unknown Batch");
    return {
      label: b.isDeleted || b.deletedAt ? `${display} (Deleted)` : display,
      value: b.id,
    };
  });
}

export function toStudentOptions(students: Student[]): SelectOption[] {
  return students.map((s) => {
    const nameLabel = safeDisplayName(s.name, s.id, "Unknown Student");
    let display = `${nameLabel} (${s.rollNumber || s.email || "No Email"})`;
    if (s.isDeleted || s.status === "deleted") {
      display += " (Deleted)";
    }
    return { label: display, value: s.id };
  });
}

/**
 * Returns the resolved college name for a given college id, falling back to the id.
 */
export function getCollegeName(hierarchy: Hierarchy | null, collegeId: string): string {
  if (!hierarchy || !collegeId) return "Unassigned";
  const college = hierarchy.collegeMap.get(collegeId);
  if (college) return safeDisplayName(college.name, collegeId, collegeId);
  const external = getExternalInstitutions(hierarchy).find((i) => i.id === collegeId || i.name === collegeId);
  if (external) return safeDisplayName(external.name, collegeId, collegeId);
  const isHash = (collegeId.length === 20 || collegeId.length === 28) && !collegeId.includes(" ");
  if (!isHash && collegeId) return collegeId;
  return collegeId || "Unassigned";
}

export const deletedCollegesSet = new Set<string>();

if (typeof window !== "undefined") {
  try {
    const stored = localStorage.getItem("lms_deleted_colleges");
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr)) {
        arr.forEach((item) => deletedCollegesSet.add(String(item).toLowerCase().trim()));
      }
    }
  } catch (_) {}
}

export function markCollegeAsDeleted(idOrName: string) {
  if (!idOrName) return;
  const normalized = idOrName.trim().toLowerCase();
  deletedCollegesSet.add(normalized);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("lms_deleted_colleges", JSON.stringify(Array.from(deletedCollegesSet)));
    } catch (_) {}
  }
}

/**
 * Derives the list of institutions present in cached student data that are NOT
 * represented in the official `colleges` collection. These are typically
 * self-registered colleges that have not yet been onboarded by an admin.
 *
 * Accepts either a fully-built `Hierarchy` or raw `(students, colleges)` arrays.
 */
export function getExternalInstitutions(students: Student[], colleges: College[]): Institution[];
export function getExternalInstitutions(hierarchy: Hierarchy | null): Institution[];
export function getExternalInstitutions(
  studentsOrHierarchy: Student[] | Hierarchy | null,
  collegesArg?: College[]
): Institution[] {
  let rawStudents: Student[];
  let colleges: College[];

  if (Array.isArray(studentsOrHierarchy)) {
    rawStudents = studentsOrHierarchy;
    colleges = collegesArg || [];
  } else {
    const hierarchy = studentsOrHierarchy;
    if (!hierarchy) return [];
    rawStudents = hierarchy.students;
    colleges = hierarchy.colleges;
  }

  // Filter out deleted or inactive students
  const activeStudents = rawStudents.filter(
    (s) => !s.isDeleted && s.status !== "deleted"
  );

  const isIgnored = (val: string | undefined | null) => {
    if (!val) return true;
    const n = normalize(val).toLowerCase();
    return (
      !n ||
      n === "global" ||
      n === "unassigned" ||
      n === "unknown institution" ||
      n === GLOBAL_INSTITUTION_ID.toLowerCase()
    );
  };

  const activeColleges = colleges.filter((c) => (c.status as string) !== "deleted" && !c.isDeleted);
  const deletedCollegeIds = new Set(colleges.filter((c) => (c.status as string) === "deleted" || c.isDeleted).map((c) => c.id));
  const deletedCollegeNames = new Set(
    colleges.filter((c) => (c.status as string) === "deleted" || c.isDeleted).map((c) => normalize(c.name).toLowerCase()).filter(Boolean)
  );

  const officialIds = new Set(activeColleges.map((c) => c.id));
  const officialNames = new Set(
    activeColleges.map((c) => normalize(c.name).toLowerCase()).filter(Boolean)
  );

  const externalMap = new Map<string, { id: string; name: string; students: Student[] }>();

  activeStudents.forEach((s) => {
    const cId = normalize(s.collegeId);
    const cName = normalize(s.collegeName || "");

    if (isIgnored(cId) && isIgnored(cName)) return;

    // Completely ignore student records associated with deleted colleges so they never jump to Outside Institutions
    if (
      (!isIgnored(cId) && (deletedCollegeIds.has(cId) || deletedCollegesSet.has(cId.toLowerCase()))) ||
      (!isIgnored(cName) && (deletedCollegeNames.has(cName.toLowerCase()) || deletedCollegesSet.has(cName.toLowerCase())))
    ) {
      return;
    }

    const isOfficial =
      (!isIgnored(cId) && officialIds.has(cId)) ||
      (!isIgnored(cName) && (officialNames.has(cName.toLowerCase()) || officialIds.has(cName)));

    if (!isOfficial) {
      const displayName = !isIgnored(cName)
        ? safeDisplayName(cName, cId, "External Institution")
        : safeDisplayName(cId, cId, "External Institution");
      
      const key = displayName.toLowerCase();
      if (!externalMap.has(key)) {
        externalMap.set(key, {
          id: displayName,
          name: displayName,
          students: [],
        });
      }
      externalMap.get(key)!.students.push(s);
    }
  });

  return Array.from(externalMap.values()).map((ext) => ({
    id: ext.name,
    name: ext.name,
    type: "external" as const,
    studentCount: ext.students.length,
    departments: Array.from(new Set(ext.students.map((s) => s.department).filter(Boolean))),
  })).sort((a, b) => a.name.localeCompare(b.name));
}


/**
 * Resolves a friendly name for any institution id from a pre-built list of
 * institutions. Falls back to the raw id when no match is found.
 */
export function getInstitutionName(institutions: Institution[], id: string): string;

/**
 * Resolves a friendly name for any institution id — official, external, or GLOBAL.
 * Falls back to the raw id when no better name is available.
 */
export function getInstitutionName(hierarchy: Hierarchy | null, id: string): string;

export function getInstitutionName(
  input: Institution[] | Hierarchy | null,
  id: string
): string {
  if (!id || id.toLowerCase() === "global" || id.toLowerCase() === "unassigned") {
    return "Unassigned";
  }

  if (Array.isArray(input)) {
    const found = input.find((i) => i.id === id || i.name === id);
    if (found) return safeDisplayName(found.name, id, id);
    const isHash = (id.length === 20 || id.length === 28) && !id.includes(" ");
    return (!isHash && id) ? id : id;
  }

  const hierarchy = input;
  if (hierarchy) {
    const official = hierarchy.collegeMap.get(id);
    if (official) return safeDisplayName(official.name, id, id);
    const external = getExternalInstitutions(hierarchy).find((i) => i.id === id || i.name === id);
    if (external) return safeDisplayName(external.name, id, id);
  }

  const isHash = (id.length === 20 || id.length === 28) && !id.includes(" ");
  if (!isHash && id) return id;
  return id || "Unassigned";
}

/**
 * Returns true when a student matches the given assignment target.
 * - "global" matches every student
 * - Other levels cascade from the institution match downward
 */
export function matchesAssignmentTarget(student: Student, target: AssignmentTarget): boolean {
  if (!target || !target.level) return false;

  if (target.level === "global") return true;

  // Institution match: prefer collegeId when present, fall back to collegeName.
  const studentCollegeId = normalize(student.collegeId).toLowerCase();
    const studentCollegeName = normalize(student.collegeName || "").toLowerCase();
    const targetCollegeId = normalize(target.collegeId || "").toLowerCase();
    const targetCollegeName = normalize(target.collegeName || "").toLowerCase();

    let institutionMatch = false;
    if (targetCollegeId) {
      institutionMatch =
        studentCollegeId === targetCollegeId ||
        (!studentCollegeId && studentCollegeName === targetCollegeName);
    } else if (targetCollegeName) {
      institutionMatch = studentCollegeName === targetCollegeName;
    } else if (targetCollegeId === GLOBAL_INSTITUTION_ID.toLowerCase()) {
      institutionMatch = true;
    }
    if (!institutionMatch) return false;

  if (target.level === "institution") return true;

  if (
    target.level === "department" ||
    target.level === "academicYear" ||
    target.level === "section" ||
    target.level === "batch" ||
    target.level === "student"
  ) {
    if (
      target.department &&
      normalize(student.department).toLowerCase() !== normalize(target.department).toLowerCase()
    ) {
      return false;
    }
  }

  if (
    target.level === "academicYear" ||
    target.level === "section" ||
    target.level === "batch" ||
    target.level === "student"
  ) {
    if (
      target.academicYear &&
      normalize(student.academicYear || "").toLowerCase() !==
        normalize(target.academicYear).toLowerCase()
    ) {
      return false;
    }
  }

  if (
    target.level === "section" ||
    target.level === "batch" ||
    target.level === "student"
  ) {
    if (
      target.section &&
      normalize(student.section).toLowerCase() !== normalize(target.section).toLowerCase()
    ) {
      return false;
    }
  }

  if (target.level === "batch" || target.level === "student") {
    if (target.batchId) {
      const ids = (student.batchIds || []).map((b) => normalize(b).toLowerCase());
      if (!ids.includes(normalize(target.batchId).toLowerCase())) return false;
    }
  }

  if (target.level === "student") {
    if (target.studentId && student.id !== target.studentId) return false;
  }

  return true;
}

export function matchesYearFilter(studentYear: string | undefined | null, filterYear: string): boolean {
  if (!filterYear) return true;
  const s = (studentYear || "").trim().toLowerCase();
  const f = filterYear.trim().toLowerCase();
  if (s === f) return true;
  if (f.startsWith("1") || f.includes("1st")) return s.startsWith("1") || s.includes("1st") || s.includes("first");
  if (f.startsWith("2") || f.includes("2nd")) return s.startsWith("2") || s.includes("2nd") || s.includes("second");
  if (f.startsWith("3") || f.includes("3rd")) return s.startsWith("3") || s.includes("3rd") || s.includes("third");
  if (f.startsWith("4") || f.includes("4th")) return s.startsWith("4") || s.includes("4th") || s.includes("fourth");
  return s.includes(f) || f.includes(s);
}

export function filterStudentByAcademicFilters(student: Student, filters: AcademicFilters): boolean {
  if (!filters.batchOnlyMode) {
    if (filters.collegeId && student.collegeId !== filters.collegeId) return false;
    if (filters.department && student.department !== filters.department) return false;
    if (filters.academicYear && !matchesYearFilter(student.academicYear, filters.academicYear)) return false;
    if (filters.section && student.section !== filters.section) return false;
  }
  if (filters.batchId && (!student.batchIds || !student.batchIds.includes(filters.batchId))) return false;
  if (filters.studentId && student.id !== filters.studentId) return false;
  return true;
}

export interface FilterValidation {
  collegeId: boolean;
  department: boolean;
  academicYear: boolean;
  section: boolean;
  batchId: boolean;
  studentId: boolean;
}

/**
 * Read-only validation: checks whether each filter value is valid in the
 * current hierarchy context.  Returns `true` for each field whose value
 * exists among the available options (or whose value is empty / "ALL").
 *
 * This function NEVER modifies filter state.  The UI uses the result to
 * display visual indicators on invalid selections.
 */
export function validateFilters(
  filters: AcademicFilters,
  hierarchy: Hierarchy | null
): FilterValidation {
  const result: FilterValidation = {
    collegeId: true,
    department: true,
    academicYear: true,
    section: true,
    batchId: true,
    studentId: true,
  };

  if (!hierarchy) return result;

  const isGlobal = filters.collegeId === GLOBAL_INSTITUTION_ID;

  // --- College / Institution ---
  if (filters.collegeId && !isGlobal) {
    result.collegeId = hierarchy.collegeMap.has(filters.collegeId);
  }

  // --- Department ---
  if (filters.department) {
    let validDepts: string[];
    if (!filters.collegeId || isGlobal) validDepts = getAllDepartments(hierarchy);
    else validDepts = getDepartmentsForCollege(hierarchy, filters.collegeId);
    result.department = validDepts.some(
      (d) => d.toLowerCase() === filters.department.toLowerCase()
    );
  }

  // --- Academic Year ---
  if (filters.academicYear) {
    let validYears: string[];
    if (!filters.collegeId || isGlobal) validYears = getAllAcademicYears(hierarchy);
    else if (!filters.department) validYears = getYearsForCollege(hierarchy, filters.collegeId);
    else validYears = getYearsForDepartment(hierarchy, filters.collegeId, filters.department);
    result.academicYear = validYears.some(
      (y) => y.toLowerCase() === filters.academicYear.toLowerCase()
    );
  }

  // --- Section ---
  if (filters.section) {
    let validSections: string[];
    if (!filters.collegeId || isGlobal) validSections = getAllSections(hierarchy);
    else if (!filters.department) validSections = getSectionsForCollege(hierarchy, filters.collegeId);
    else if (!filters.academicYear)
      validSections = getSectionsForCollegeAndDepartment(hierarchy, filters.collegeId, filters.department);
    else
      validSections = getSectionsForYear(hierarchy, filters.collegeId, filters.department, filters.academicYear);
    result.section = validSections.some(
      (s) => cleanSectionName(s).toLowerCase() === cleanSectionName(filters.section).toLowerCase()
    );
  }

  // --- Batch ---
  if (filters.batchId) {
    if (filters.batchOnlyMode) {
      // In Batch Only mode, any batch that exists in the platform is valid.
      result.batchId = hierarchy.batches.some((b) => b.id === filters.batchId);
    } else {
      // In Combined mode, batch must exist under the current hierarchy branch.
      const list = hierarchy.batches.filter((b) => {
        if (filters.collegeId && !isGlobal && b.collegeId && b.collegeId !== filters.collegeId) return false;
        if (filters.department && b.department && b.department.toLowerCase() !== filters.department.toLowerCase())
          return false;
        if (
          filters.academicYear &&
          b.academicYear &&
          b.academicYear.toLowerCase() !== filters.academicYear.toLowerCase()
        )
          return false;
        if (
          filters.section &&
          b.section &&
          cleanSectionName(b.section).toLowerCase() !== cleanSectionName(filters.section).toLowerCase()
        )
          return false;
        return true;
      });
      result.batchId = list.some((b) => b.id === filters.batchId);
    }
  }

  // --- Student ---
  if (filters.studentId) {
    if (filters.batchId) {
      const studentsInBatch = getStudentsForBatch(hierarchy, filters.batchId);
      result.studentId = studentsInBatch.some((s) => s.id === filters.studentId);
    } else {
      result.studentId = hierarchy.students.some((s) => s.id === filters.studentId);
    }
  }

  return result;
}
