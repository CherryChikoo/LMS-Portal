import {
  subscribeToAllColleges,
  subscribeToAllBatches,
  subscribeToAllStudents,
  getAllColleges,
  getAllBatches,
  getAllStudents,
} from "@/lib/services";
import {
  buildHierarchy,
  getExternalInstitutions,
  getInstitutionName as resolveInstitutionName,
  GLOBAL_INSTITUTION,
  type Hierarchy,
  type Institution,
} from "./hierarchy-data";
import type { College, Batch, Student, SelectOption } from "@/types";

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

interface HierarchyCache {
  colleges: CacheEntry<College[]> | null;
  batches: CacheEntry<Batch[]> | null;
  students: CacheEntry<Student[]> | null;
  hierarchy: Hierarchy | null;
  listeners: number;
  unsubscribers: Array<() => void>;
  error: Error | null;
  loading: boolean;
}

const cache: HierarchyCache = {
  colleges: null,
  batches: null,
  students: null,
  hierarchy: null,
  listeners: 0,
  unsubscribers: [],
  error: null,
  loading: false,
};

function recomputeHierarchy() {
  if (cache.colleges && cache.batches && cache.students) {
    let filteredColleges = cache.colleges.data;
    let filteredBatches = cache.batches.data;
    let filteredStudents = cache.students.data;

    try {
      const uStr = typeof window !== "undefined" ? localStorage.getItem("lms_user") || localStorage.getItem("user") : null;
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.role === "college_admin" && parsed.collegeId) {
          filteredColleges = filteredColleges.filter(c => c.id === parsed.collegeId);
          filteredStudents = filteredStudents.filter(s => s.collegeId === parsed.collegeId);
          const validStudentBatchIds = new Set(filteredStudents.flatMap(s => s.batchIds || []));
          filteredBatches = filteredBatches.filter(b => b.collegeId === parsed.collegeId || validStudentBatchIds.has(b.id));
        }
      }
    } catch (_) {}

    cache.hierarchy = buildHierarchy(
      filteredColleges,
      filteredBatches,
      filteredStudents
    );
    cache.loading = false;
  }
}

function notifyListeners() {
  callbacks.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error("Hierarchy cache listener error:", err);
    }
  });
}

const callbacks = new Set<() => void>();

export function subscribeToHierarchyCache(callback: () => void): () => void {
  callbacks.add(callback);
  if (cache.listeners === 0) {
    startSubscriptions();
  }
  cache.listeners++;

  return () => {
    callbacks.delete(callback);
    cache.listeners = Math.max(0, cache.listeners - 1);
    if (cache.listeners === 0) {
      stopSubscriptions();
    }
  };
}

function startSubscriptions() {
  cache.loading = true;
  cache.error = null;

  const unsubColleges = subscribeToAllColleges((data) => {
    cache.colleges = { data, updatedAt: Date.now() };
    recomputeHierarchy();
    notifyListeners();
  });

  const unsubBatches = subscribeToAllBatches((data) => {
    cache.batches = { data, updatedAt: Date.now() };
    recomputeHierarchy();
    notifyListeners();
  });

  const unsubStudents = subscribeToAllStudents((data) => {
    cache.students = { data, updatedAt: Date.now() };
    recomputeHierarchy();
    notifyListeners();
  });

  cache.unsubscribers = [unsubColleges, unsubBatches, unsubStudents];

  // Seed with a one-time fetch if the cache is empty so the first render does
  // not wait for the snapshot event.
  if (!cache.colleges || !cache.batches || !cache.students) {
    Promise.all([getAllColleges(), getAllBatches(), getAllStudents()])
      .then(([colleges, batches, students]) => {
        cache.colleges = { data: colleges, updatedAt: Date.now() };
        cache.batches = { data: batches, updatedAt: Date.now() };
        cache.students = { data: students, updatedAt: Date.now() };
        recomputeHierarchy();
        notifyListeners();
      })
      .catch((err) => {
        cache.error = err instanceof Error ? err : new Error(String(err));
        notifyListeners();
      })
      .finally(() => {
        cache.loading = false;
        notifyListeners();
      });
  }
}

function stopSubscriptions() {
  cache.unsubscribers.forEach((unsub) => unsub());
  cache.unsubscribers = [];
}

export function getHierarchyCache(): {
  hierarchy: Hierarchy | null;
  institutions: Institution[];
  externalInstitutions: Institution[];
  institutionOptions: SelectOption[];
  getInstitutionName: (id: string) => string;
  loading: boolean;
  error: Error | null;
} {
  const colleges = cache.colleges?.data || [];
  const students = cache.students?.data || [];
  const externals = getExternalInstitutions(students, colleges);

  // Unified institutions list: GLOBAL + official colleges + external institutions.
  // Sorted by name for stable ordering; GLOBAL always pinned to the top so it
  // stays the default selection in dropdowns.
  const officialInstitutions: Institution[] = colleges.map((c) => ({
    id: c.id,
    name: c.name,
    type: "official",
    code: c.code,
    departments: c.departments,
  }));

  const institutions: Institution[] = [
    GLOBAL_INSTITUTION,
    ...officialInstitutions,
    ...externals,
  ];

  const institutionOptions: SelectOption[] = institutions.map((inst) =>
    inst.type === "external"
      ? { label: `${inst.name} (external)`, value: inst.id }
      : { label: inst.name, value: inst.id }
  );

  return {
    hierarchy: cache.hierarchy,
    institutions,
    externalInstitutions: externals,
    institutionOptions,
    getInstitutionName: (id: string) => resolveInstitutionName(institutions, id),
    loading: cache.loading,
    error: cache.error,
  };
}

export function invalidateHierarchyCache(): void {
  cache.colleges = null;
  cache.batches = null;
  cache.students = null;
  cache.hierarchy = null;
  cache.error = null;
}
