import { useSyncExternalStore } from "react";
import type { College, Batch, Student, Exam, Resource, ExamAttempt, SelectOption } from "@/types";
import { markCollegeAsDeleted, type Hierarchy, type Institution } from "@/lib/hierarchy/hierarchy-data";

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
  setTimeout(() => {
    listeners.forEach((listener) => listener());
  }, 0);
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

import {
  optimisticDeleteCollegeFromCache,
  optimisticDeleteStudentFromCache,
  optimisticUpdateStudentInCache,
  refreshCache,
} from "./lms-data-cache";

// Re-export for pages to call after mutations
export { refreshCache };

/** Schedule a background refresh after a short delay (lets the server-side mutation commit first) */
function scheduleRefresh(delayMs = 2000) {
  setTimeout(() => { refreshCache().catch(() => {}); }, delayMs);
}

export function optimisticDeleteStudent(studentId: string): LMSStoreState {
  optimisticDeleteStudentFromCache(studentId);
  scheduleRefresh();
  return storeState;
}

/**
 * Optimistically delete a college from local store state
 */
export function optimisticDeleteCollege(collegeId: string): LMSStoreState {
  optimisticDeleteCollegeFromCache(collegeId);
  scheduleRefresh();
  return storeState;
}

/**
 * Optimistically update a student in local store state
 */
export function optimisticUpdateStudent(studentId: string, updates: Partial<Student>): LMSStoreState {
  optimisticUpdateStudentInCache(studentId, updates);
  scheduleRefresh();
  return storeState;
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
