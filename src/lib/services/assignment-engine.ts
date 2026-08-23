import type { AssignmentTarget, Student } from "@/types";

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().trim();
}

function isAllValue(value: string): boolean {
  if (!value) return true;
  const v = value.toLowerCase().trim();
  return (
    v === "" ||
    v === "all" ||
    v === "all colleges" ||
    v === "all departments" ||
    v === "all academic years" ||
    v === "all sections" ||
    v === "all batches" ||
    v === "all students" ||
    v === "global" ||
    v === "composite" ||
    v === "*"
  );
}

/**
 * Evaluate a single composite target using AND matching across specified dimensions.
 * A student matches only when EVERY specified (non-ALL) dimension matches.
 * Unspecified dimensions (empty, "all", "all colleges", "global") are wildcards
 * and do not constrain the match. If no dimensions are specified at all, the
 * target is treated as public/global and matches every student.
 */
function matchesCompositeTarget(target: AssignmentTarget, student: Student): boolean {
  const tCollegeId = normalize(target.collegeId);
  const tCollegeName = normalize(target.collegeName);
  const tBatchId = normalize(target.batchId);
  const tBatchName = normalize(target.batchName);
  const tDept = normalize(target.department);
  const tYear = normalize(target.academicYear);
  const tSection = normalize(target.section);

  const collegeSpecified = !isAllValue(tCollegeId) || !isAllValue(tCollegeName);
  const batchSpecified = !isAllValue(tBatchId) || !isAllValue(tBatchName);
  const deptSpecified = !isAllValue(tDept);
  const yearSpecified = !isAllValue(tYear);
  const sectionSpecified = !isAllValue(tSection);

  // No constraints means the target is public/global.
  if (!collegeSpecified && !batchSpecified && !deptSpecified && !yearSpecified && !sectionSpecified) {
    return true;
  }

  const sCollegeId = normalize(student.collegeId);
  const sCollegeName = normalize(student.collegeName);
  const sDept = normalize(student.department);
  const sYear = normalize(student.academicYear);
  const sSection = normalize(student.section);
  const sBatchIds = (student.batchIds || []).map((b) => normalize(b));

  const cleanSlug = (v?: unknown) => (v ? String(v).toLowerCase().trim().replace(/[^a-z0-9]+/g, "") : "");

  const targetCollegeSlugs = new Set([
    tCollegeId,
    tCollegeName,
    cleanSlug(target.collegeId),
    cleanSlug(target.collegeName),
  ].filter(Boolean));

  const studentCollegeSlugs = [
    sCollegeId,
    sCollegeName,
    cleanSlug(student.collegeId),
    cleanSlug(student.collegeName),
  ].filter(Boolean);

  const batchIds = new Set([tBatchId, tBatchName, cleanSlug(target.batchId), cleanSlug(target.batchName)].filter(Boolean));

  let matchCollege = collegeSpecified && (
    targetCollegeSlugs.has("global") ||
    targetCollegeSlugs.has("all") ||
    studentCollegeSlugs.some((s) => targetCollegeSlugs.has(s))
  );

  // Forgiving fallback for external colleges: If direct match fails, check if one slug contains the other.
  // This solves issues where a student registers as "stans" but the admin targets "stanshub" (or vice versa).
  if (collegeSpecified && !matchCollege) {
    const targetArr = Array.from(targetCollegeSlugs);
    matchCollege = studentCollegeSlugs.some(s => 
      targetArr.some(t => s.length > 3 && t.length > 3 && (s.includes(t) || t.includes(s)))
    );
  }

  const matchBatch = batchSpecified && sBatchIds.some((b) => batchIds.has(b));

  const matchDept = deptSpecified && sDept === tDept;
  const matchYear = yearSpecified && sYear === tYear;
  const matchSection = sectionSpecified && sSection === tSection;

  // AND across specified dimensions: every specified dimension must match.
  const required: boolean[] = [];
  if (collegeSpecified) required.push(matchCollege);
  if (batchSpecified) required.push(matchBatch);
  if (deptSpecified) required.push(matchDept);
  if (yearSpecified) required.push(matchYear);
  if (sectionSpecified) required.push(matchSection);

  if (required.length === 0) return true;
  return required.every(Boolean);
}

/**
 * Reusable assignment evaluation engine.
 * Evaluates whether a resource, test, or announcement is assigned to the given student
 * based on hierarchy: College, Department, Academic Year, Section, Batch, Selected Students.
 *
 * Matching semantics:
 * - Direct student targeting (id/email) always grants access.
 * - Single-dimension targets (college, department, year, section, batch) match on
 *   that single dimension against the student.
 * - Composite targets use AND matching across every specified (non-wildcard)
 *   dimension: ALL specified dimensions must match. Unspecified dimensions
 *   (empty, "all", "global") are wildcards and do not constrain the match.
 *   If a composite target specifies no dimensions, it is treated as public/global.
 * - Legacy `sharedWith` list is consulted as a fallback only when no structured
 *   targets are provided; it retains its previous inclusive matching semantics.
 */
export function isAssignedToStudent(
  targets: AssignmentTarget[] | undefined,
  student: Student,
  legacySharedWith?: string[]
): boolean {
  // If no structured targets are present, check legacy sharedWith or default to public/assigned
  if (!targets || targets.length === 0) {
    if (legacySharedWith && legacySharedWith.length > 0) {
      const lowerShared = legacySharedWith.map((s) => s.toLowerCase());
      const sId = normalize(student.id);
      const sEmail = normalize(student.email);
      const sCollegeId = normalize(student.collegeId);
      const sCollegeName = normalize(student.collegeName);

      if (
        lowerShared.includes("all") ||
        lowerShared.includes("global") ||
        lowerShared.includes(sId) ||
        (sEmail && lowerShared.includes(sEmail)) ||
        (sCollegeId && lowerShared.includes(sCollegeId)) ||
        (sCollegeName && lowerShared.includes(sCollegeName))
      ) {
        return true;
      }
      return false;
    }
    // If neither targets nor sharedWith are specified, consider it unassigned and hidden from students
    return false;
  }

  const sId = normalize(student.id);
  const sEmail = normalize(student.email);
  const sCollegeId = normalize(student.collegeId);
  const sCollegeName = normalize(student.collegeName);
  const sDept = normalize(student.department);
  const sYear = normalize(student.academicYear);
  const sSection = normalize(student.section);
  const sBatchIds = (student.batchIds || []).map((b) => normalize(b));

  for (const target of targets) {
    const type = normalize(target.type);
    const ids = (target.ids || []).map((id) => normalize(id));

    // Check "students" explicit target
    if (type === "students") {
      if (ids.includes("all") || ids.includes("global") || ids.includes(sId) || (sEmail && ids.includes(sEmail))) {
        return true;
      }
    }

    // Check "college" target
    if (type === "college") {
      let isMatch = ids.includes("all") ||
        ids.includes("global") ||
        ids.includes("all colleges") ||
        ids.includes(sCollegeId) ||
        ids.includes(sCollegeName);
        
      if (!isMatch) {
        // Forgiving fallback for external colleges
        isMatch = ids.some(id => 
          (sCollegeId.length > 3 && id.length > 3 && (sCollegeId.includes(id) || id.includes(sCollegeId))) ||
          (sCollegeName.length > 3 && id.length > 3 && (sCollegeName.includes(id) || id.includes(sCollegeName)))
        );
      }
      
      if (isMatch) return true;
    }

    // Check "department" target
    if (type === "department") {
      if (ids.includes("all") || ids.includes(sDept)) {
        return true;
      }
    }

    // Check "year" target
    if (type === "year") {
      if (ids.includes("all") || ids.includes(sYear)) {
        return true;
      }
    }

    // Check "section" target
    if (type === "section") {
      if (ids.includes("all") || ids.includes(sSection)) {
        return true;
      }
    }

    // Check "batch" target
    if (type === "batch") {
      const names = (target.names || []).map((n) => normalize(n));
      if (
        ids.includes("all") ||
        sBatchIds.some((b) => ids.includes(b) || names.includes(b))
      ) {
        return true;
      }
    }

    // Check "composite" target (AND across specified dimensions)
    if (type === "composite") {
      if (matchesCompositeTarget(target, student)) {
        return true;
      }
    }
  }

  return false;
}
