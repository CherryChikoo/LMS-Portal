import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  subscribeToDocuments,
  where,
} from "@/lib/firebase/firestore";
import type { College, Batch } from "@/types";
import { getStudentsByCollege, updateStudentProfile } from "./student-service";
import { getAllResources, updateResource } from "./resource-service";
import { getAllExams, updateExam } from "./exam-service";
import { getAllDoubts, updateDoubt } from "./doubt-service";

const COLLEGE_COLLECTION = "colleges";
const BATCH_COLLECTION = "batches";

export async function getAllColleges(): Promise<College[]> {
  return getDocuments<College>(COLLEGE_COLLECTION);
}

export function subscribeToAllColleges(callback: (colleges: College[]) => void): () => void {
  return subscribeToDocuments<College>(COLLEGE_COLLECTION, callback);
}

export async function getCollegeById(id: string): Promise<College | null> {
  return getDocument<College>(COLLEGE_COLLECTION, id);
}

export async function createCollege(data: Omit<College, "id">): Promise<string> {
  return addDocument<College>(COLLEGE_COLLECTION, data);
}

export async function updateCollege(id: string, data: Partial<College>): Promise<void> {
  return updateDocument<College>(COLLEGE_COLLECTION, id, data);
}

export async function deleteCollege(id: string): Promise<void> {
  return deleteDocument(COLLEGE_COLLECTION, id);
}

// Batches
export async function getAllBatches(): Promise<Batch[]> {
  return getDocuments<Batch>(BATCH_COLLECTION);
}

export function subscribeToAllBatches(callback: (batches: Batch[]) => void): () => void {
  return subscribeToDocuments<Batch>(BATCH_COLLECTION, callback);
}

export async function getBatchById(id: string): Promise<Batch | null> {
  return getDocument<Batch>(BATCH_COLLECTION, id);
}

export async function getBatchesByCollege(collegeId: string): Promise<Batch[]> {
  return getDocuments<Batch>(BATCH_COLLECTION, [where("collegeId", "==", collegeId)]);
}

export async function createBatch(data: Omit<Batch, "id">): Promise<string> {
  return addDocument<Batch>(BATCH_COLLECTION, data);
}

export async function updateBatch(id: string, data: Partial<Batch>): Promise<void> {
  return updateDocument<Batch>(BATCH_COLLECTION, id, data);
}

export async function deleteBatch(id: string): Promise<void> {
  return deleteDocument(BATCH_COLLECTION, id);
}

// Department helpers
export const PREDEFINED_DEPARTMENTS = [
  "Computer Science & Engineering (CSE)",
  "Information Technology (IT)",
  "Electronics & Communication Engineering (ECE)",
  "Electrical & Electronics Engineering (EEE)",
  "Mechanical Engineering",
  "Civil Engineering",
  "Artificial Intelligence & Machine Learning (AI & ML)",
  "Data Science",
  "Business Administration",
  "General",
  "Custom Department",
] as const;

export const CUSTOM_DEPARTMENT_SENTINEL = "Custom Department";

export function normalizeDepartmentName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function ensureGeneralDepartment(departments: string[]): string[] {
  const hasGeneral = departments.some((d) => d.toLowerCase() === "general");
  if (hasGeneral) {
    return [...departments];
  }
  return [...departments, "General"];
}

/**
 * Safely delete a department from a college without deleting students or losing data.
 * Automatically migrates all students, batches, resources, exams, and doubts to "General".
 */
export async function deleteDepartmentAndMigrate(college: College, deptName: string): Promise<void> {
  const targetDept = deptName.trim().toLowerCase();
  if (!targetDept) return;

  // 1. Update College departments list (ensure "General" remains)
  const updatedDepts = ensureGeneralDepartment(
    (college.departments || []).filter((d) => d.toLowerCase() !== targetDept)
  );
  await updateCollege(college.id, { departments: updatedDepts, updatedAt: new Date() });

  // 2. Migrate Students in this college/department to "General"
  const collegeStudents = await getStudentsByCollege(college.id);
  const affectedStudents = collegeStudents.filter(
    (s) => (s.department || "").toLowerCase() === targetDept
  );
  await Promise.all(
    affectedStudents.map((s) =>
      updateStudentProfile(s.id, { department: "General", updatedAt: new Date() })
    )
  );

  // 3. Migrate Batches in this college/department to "General"
  const collegeBatches = await getBatchesByCollege(college.id);
  const affectedBatches = collegeBatches.filter(
    (b) => (b.department || "").toLowerCase() === targetDept
  );
  await Promise.all(
    affectedBatches.map((b) =>
      updateBatch(b.id, { department: "General", updatedAt: new Date() })
    )
  );

  // 4. Migrate Resources targeting this college & department
  const allResources = await getAllResources();
  const affectedResources = allResources.filter((res) =>
    res.targets?.some((t) =>
      (t.collegeId === college.id || t.collegeName === college.name || !t.collegeId) &&
      ((t.department || "").toLowerCase() === targetDept ||
        (t.type === "department" && (t.ids?.some((id) => id.toLowerCase() === targetDept) || t.names?.some((n) => n.toLowerCase() === targetDept))))
    )
  );
  await Promise.all(
    affectedResources.map((res) => {
      const updatedTargets = (res.targets || []).map((t) => {
        const matchesCollege = t.collegeId === college.id || t.collegeName === college.name || !t.collegeId;
        if (!matchesCollege) return t;
        const newTarget = { ...t };
        if ((t.department || "").toLowerCase() === targetDept) {
          newTarget.department = "General";
        }
        if (t.type === "department") {
          if (t.ids) newTarget.ids = t.ids.map((id) => (id.toLowerCase() === targetDept ? "General" : id));
          if (t.names) newTarget.names = t.names.map((n) => (n.toLowerCase() === targetDept ? "General" : n));
        }
        return newTarget;
      });
      return updateResource(res.id, { targets: updatedTargets, updatedAt: new Date() });
    })
  );

  // 5. Migrate Exams targeting this college & department
  const allExams = await getAllExams();
  const affectedExams = allExams.filter((ex) =>
    ex.targets?.some((t) =>
      (t.collegeId === college.id || t.collegeName === college.name || !t.collegeId) &&
      ((t.department || "").toLowerCase() === targetDept ||
        (t.type === "department" && (t.ids?.some((id) => id.toLowerCase() === targetDept) || t.names?.some((n) => n.toLowerCase() === targetDept))))
    )
  );
  await Promise.all(
    affectedExams.map((ex) => {
      const updatedTargets = (ex.targets || []).map((t) => {
        const matchesCollege = t.collegeId === college.id || t.collegeName === college.name || !t.collegeId;
        if (!matchesCollege) return t;
        const newTarget = { ...t };
        if ((t.department || "").toLowerCase() === targetDept) {
          newTarget.department = "General";
        }
        if (t.type === "department") {
          if (t.ids) newTarget.ids = t.ids.map((id) => (id.toLowerCase() === targetDept ? "General" : id));
          if (t.names) newTarget.names = t.names.map((n) => (n.toLowerCase() === targetDept ? "General" : n));
        }
        return newTarget;
      });
      return updateExam(ex.id, { targets: updatedTargets, updatedAt: new Date() });
    })
  );

  // 6. Migrate Doubts in this college/department
  const allDoubts = await getAllDoubts();
  const affectedDoubts = allDoubts.filter((d: any) =>
    (d.collegeId === college.id || !d.collegeId) && (d.department || "").toLowerCase() === targetDept
  );
  await Promise.all(
    affectedDoubts.map((d) =>
      updateDoubt(d.id, { department: "General", updatedAt: new Date() } as any)
    )
  );
}

/**
 * Safely rename a department across a college and all referential entities (students, batches, resources, exams, doubts).
 */
export async function renameDepartmentAndMigrate(college: College, oldName: string, newName: string): Promise<void> {
  const targetOld = oldName.trim().toLowerCase();
  const targetNew = newName.trim();
  if (!targetOld || !targetNew || targetOld === targetNew.toLowerCase()) return;

  // 1. Update College departments list
  const updatedDepts = ensureGeneralDepartment(
    (college.departments || []).map((d) => (d.toLowerCase() === targetOld ? targetNew : d))
  );
  await updateCollege(college.id, { departments: updatedDepts, updatedAt: new Date() });

  // 2. Migrate Students
  const collegeStudents = await getStudentsByCollege(college.id);
  const affectedStudents = collegeStudents.filter(
    (s) => (s.department || "").toLowerCase() === targetOld
  );
  await Promise.all(
    affectedStudents.map((s) =>
      updateStudentProfile(s.id, { department: targetNew, updatedAt: new Date() })
    )
  );

  // 3. Migrate Batches
  const collegeBatches = await getBatchesByCollege(college.id);
  const affectedBatches = collegeBatches.filter(
    (b) => (b.department || "").toLowerCase() === targetOld
  );
  await Promise.all(
    affectedBatches.map((b) =>
      updateBatch(b.id, { department: targetNew, updatedAt: new Date() })
    )
  );

  // 4. Migrate Resources
  const allResources = await getAllResources();
  const affectedResources = allResources.filter((res) =>
    res.targets?.some((t) =>
      (t.collegeId === college.id || t.collegeName === college.name || !t.collegeId) &&
      ((t.department || "").toLowerCase() === targetOld ||
        (t.type === "department" && (t.ids?.some((id) => id.toLowerCase() === targetOld) || t.names?.some((n) => n.toLowerCase() === targetOld))))
    )
  );
  await Promise.all(
    affectedResources.map((res) => {
      const updatedTargets = (res.targets || []).map((t) => {
        const matchesCollege = t.collegeId === college.id || t.collegeName === college.name || !t.collegeId;
        if (!matchesCollege) return t;
        const newTarget = { ...t };
        if ((t.department || "").toLowerCase() === targetOld) {
          newTarget.department = targetNew;
        }
        if (t.type === "department") {
          if (t.ids) newTarget.ids = t.ids.map((id) => (id.toLowerCase() === targetOld ? targetNew : id));
          if (t.names) newTarget.names = t.names.map((n) => (n.toLowerCase() === targetOld ? targetNew : n));
        }
        return newTarget;
      });
      return updateResource(res.id, { targets: updatedTargets, updatedAt: new Date() });
    })
  );

  // 5. Migrate Exams
  const allExams = await getAllExams();
  const affectedExams = allExams.filter((ex) =>
    ex.targets?.some((t) =>
      (t.collegeId === college.id || t.collegeName === college.name || !t.collegeId) &&
      ((t.department || "").toLowerCase() === targetOld ||
        (t.type === "department" && (t.ids?.some((id) => id.toLowerCase() === targetOld) || t.names?.some((n) => n.toLowerCase() === targetOld))))
    )
  );
  await Promise.all(
    affectedExams.map((ex) => {
      const updatedTargets = (ex.targets || []).map((t) => {
        const matchesCollege = t.collegeId === college.id || t.collegeName === college.name || !t.collegeId;
        if (!matchesCollege) return t;
        const newTarget = { ...t };
        if ((t.department || "").toLowerCase() === targetOld) {
          newTarget.department = targetNew;
        }
        if (t.type === "department") {
          if (t.ids) newTarget.ids = t.ids.map((id) => (id.toLowerCase() === targetOld ? targetNew : id));
          if (t.names) newTarget.names = t.names.map((n) => (n.toLowerCase() === targetOld ? targetNew : n));
        }
        return newTarget;
      });
      return updateExam(ex.id, { targets: updatedTargets, updatedAt: new Date() });
    })
  );

  // 6. Migrate Doubts
  const allDoubts = await getAllDoubts();
  const affectedDoubts = allDoubts.filter((d: any) =>
    (d.collegeId === college.id || !d.collegeId) && (d.department || "").toLowerCase() === targetOld
  );
  await Promise.all(
    affectedDoubts.map((d) =>
      updateDoubt(d.id, { department: targetNew, updatedAt: new Date() } as any)
    )
  );
}
