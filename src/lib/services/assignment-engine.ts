import type { AssignmentTarget, Student } from "@/types";

/**
 * Reusable assignment evaluation engine.
 * Evaluates whether a resource, test, or announcement is assigned to the given student
 * based on hierarchy: College, Department, Academic Year, Section, Batch, Selected Students.
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
      if (
        lowerShared.includes("all") ||
        lowerShared.includes(student.id.toLowerCase()) ||
        (student.email && lowerShared.includes(student.email.toLowerCase())) ||
        (student.collegeId && lowerShared.includes(student.collegeId.toLowerCase())) ||
        (student.collegeName && lowerShared.includes(student.collegeName.toLowerCase()))
      ) {
        return true;
      }
      return false;
    }
    // If neither targets nor sharedWith are specified, consider it assigned to all students
    return true;
  }

  const sId = student.id.toLowerCase();
  const sEmail = (student.email || "").toLowerCase();
  const sCollegeId = (student.collegeId || "").toLowerCase();
  const sCollegeName = (student.collegeName || "").toLowerCase();
  const sDept = (student.department || "").toLowerCase();
  const sYear = (student.academicYear || "").toLowerCase();
  const sSection = (student.section || "").toLowerCase();
  const sBatchIds = (student.batchIds || []).map((b) => b.toLowerCase());

  for (const target of targets) {
    const type = (target.type || "").toLowerCase();
    const ids = (target.ids || []).map((id) => id.toLowerCase());

    // Check "students" explicit target
    if (type === "students") {
      if (ids.includes("all") || ids.includes(sId) || (sEmail && ids.includes(sEmail))) {
        return true;
      }
    }

    // Check "college" target
    if (type === "college") {
      if (
        ids.includes("all") ||
        ids.includes("all colleges") ||
        (sCollegeId && ids.includes(sCollegeId)) ||
        (sCollegeName && ids.includes(sCollegeName))
      ) {
        return true;
      }
    }

    // Check "department" target
    if (type === "department") {
      if (ids.includes("all") || (sDept && ids.includes(sDept))) {
        return true;
      }
    }

    // Check "year" target
    if (type === "year") {
      if (ids.includes("all") || (sYear && ids.includes(sYear))) {
        return true;
      }
    }

    // Check "section" target
    if (type === "section") {
      if (ids.includes("all") || (sSection && ids.includes(sSection))) {
        return true;
      }
    }

    // Check "batch" target
    if (type === "batch") {
      if (ids.includes("all") || sBatchIds.some((b) => ids.includes(b))) {
        return true;
      }
    }

    // Check "composite" target (intersection of defined filters)
    if (type === "composite") {
      const tCollege = (target.collegeId || "").toLowerCase();
      const tDept = (target.department || "").toLowerCase();
      const tYear = (target.academicYear || "").toLowerCase();
      const tSection = (target.section || "").toLowerCase();
      const tBatch = (target.batchId || "").toLowerCase();

      const matchCollege =
        !tCollege ||
        tCollege === "all" ||
        tCollege === "all colleges" ||
        sCollegeId === tCollege ||
        sCollegeName === tCollege;

      const matchDept = !tDept || tDept === "all" || sDept === tDept;
      const matchYear = !tYear || tYear === "all" || sYear === tYear;
      const matchSection = !tSection || tSection === "all" || sSection === tSection;
      const matchBatch = !tBatch || tBatch === "all" || sBatchIds.includes(tBatch);

      if (matchCollege && matchDept && matchYear && matchSection && matchBatch) {
        return true;
      }
    }
  }

  return false;
}
