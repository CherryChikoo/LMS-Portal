import { useSyncExternalStore } from "react";
import type { College, Batch, Student, Exam, Resource, ExamAttempt, SelectOption } from "@/types";
import type { Hierarchy, Institution } from "@/lib/hierarchy/hierarchy-data";

export interface LMSStoreState {
  colleges: College[];
  batches: Batch[];
  students: Student[];
  exams: Exam[];
  resources: Resource[];
  attempts: ExamAttempt[];
  rawColleges: College[];
  filteredColleges: College[];
  filteredBatches: Batch[];
  filteredStudents: Student[];
  filteredExams: Exam[];
  filteredResources: Resource[];
  filteredAttempts: ExamAttempt[];
  hierarchy: Hierarchy | null;
  institutions: Institution[];
  externalInstitutions: Institution[];
  institutionOptions: SelectOption[];
  loading: boolean;
  error: Error | null;
  getInstitutionName: (id: string) => string;
}

const defaultState: LMSStoreState = {
  colleges: [],
  batches: [],
  students: [],
  exams: [],
  resources: [],
  attempts: [],
  rawColleges: [],
  filteredColleges: [],
  filteredBatches: [],
  filteredStudents: [],
  filteredExams: [],
  filteredResources: [],
  filteredAttempts: [],
  hierarchy: null,
  institutions: [],
  externalInstitutions: [],
  institutionOptions: [],
  loading: true,
  error: null,
  getInstitutionName: () => "Unknown Institution",
};

let storeState: LMSStoreState = defaultState;
const listeners = new Set<() => void>();

export function setLMSStoreState(nextState: Partial<LMSStoreState> | ((prev: LMSStoreState) => LMSStoreState)) {
  const updated = typeof nextState === "function" ? nextState(storeState) : { ...storeState, ...nextState };
  
  let changed = false;
  const keys = Object.keys(updated) as (keyof LMSStoreState)[];
  for (const k of keys) {
    if (!Object.is(storeState[k], updated[k])) {
      changed = true;
      break;
    }
  }
  if (!changed) return;

  storeState = updated;
  listeners.forEach((listener) => listener());
}

export function getLMSStoreState(): LMSStoreState {
  return storeState;
}

export function subscribeToLMSStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Optimistically delete a student from local store state
 */
export function optimisticDeleteStudent(studentId: string): LMSStoreState {
  const prev = storeState;
  const nextStudents = prev.students.filter((s) => s.id !== studentId);
  const nextFiltered = prev.filteredStudents.filter((s) => s.id !== studentId);
  const nextState: LMSStoreState = {
    ...prev,
    students: nextStudents,
    filteredStudents: nextFiltered,
  };
  setLMSStoreState(nextState);
  return prev;
}

/**
 * Optimistically update a student in local store state
 */
export function optimisticUpdateStudent(studentId: string, updates: Partial<Student>): LMSStoreState {
  const prev = storeState;
  const updateItem = (s: Student) => (s.id === studentId ? { ...s, ...updates } : s);
  const nextState: LMSStoreState = {
    ...prev,
    students: prev.students.map(updateItem),
    filteredStudents: prev.filteredStudents.map(updateItem),
  };
  setLMSStoreState(nextState);
  return prev;
}

/**
 * High-performance React hook for subscribing to fine-grained LMS store slices.
 * Prevents unnecessary re-renders when unrelated data slices update.
 */
export function useLMSStoreSelector<T>(selector: (state: LMSStoreState) => T): T {
  return useSyncExternalStore(
    subscribeToLMSStore,
    () => selector(storeState),
    () => selector(defaultState)
  );
}
