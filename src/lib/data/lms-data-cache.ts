import {
  subscribeToAllColleges,
  subscribeToAllBatches,
  subscribeToAllStudents,
  subscribeToAllExams,
  subscribeToAllResources,
  subscribeToAllAttempts,
  getAllColleges,
  getAllBatches,
  getAllStudents,
  getAllExamsIncludingDeleted,
  getAllResources,
  subscribeToStudentsByCollege,
  subscribeToBatchesByCollege,
  getStudentsByCollege,
  getBatchesByCollege,
} from "@/lib/services";
import { getStudentAttempts } from "@/lib/services";
import {
  buildHierarchy,
  getExternalInstitutions,
  getInstitutionName as resolveInstitutionName,
  safeDisplayName,
  type Hierarchy,
  type Institution,
} from "@/lib/hierarchy/hierarchy-data";
import type { College, Batch, Student, SelectOption, Exam, Resource, ExamAttempt } from "@/types";
import { setLMSStoreState } from "./lms-store";

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

export interface LMSDataCacheState {
  colleges: CacheEntry<College[]> | null;
  batches: CacheEntry<Batch[]> | null;
  students: CacheEntry<Student[]> | null;
  exams: CacheEntry<Exam[]> | null;
  resources: CacheEntry<Resource[]> | null;
  attempts: CacheEntry<ExamAttempt[]> | null;
  
  hierarchy: Hierarchy | null;
  rawColleges: College[];
  filteredColleges: College[];
  filteredBatches: Batch[];
  filteredStudents: Student[];
  filteredExams: Exam[];
  filteredResources: Resource[];
  filteredAttempts: ExamAttempt[];

  listeners: number;
  unsubscribers: Array<() => void>;
  error: Error | null;
  loading: boolean;
  
  _exportedState: any;
}

const cache: LMSDataCacheState = {
  colleges: null,
  batches: null,
  students: null,
  exams: null,
  resources: null,
  attempts: null,

  hierarchy: null,
  rawColleges: [],
  filteredColleges: [],
  filteredBatches: [],
  filteredStudents: [],
  filteredExams: [],
  filteredResources: [],
  filteredAttempts: [],

  listeners: 0,
  unsubscribers: [],
  error: null,
  loading: false,
  _exportedState: null,
};

function recomputeScopedData() {
  const collegesData = cache.colleges?.data || [];
  const batchesData = cache.batches?.data || [];
  const studentsData = cache.students?.data || [];
  const examsData = cache.exams?.data || [];
  const resourcesData = cache.resources?.data || [];
  const attemptsData = cache.attempts?.data || [];

  cache.rawColleges = collegesData;
  let fColleges = collegesData.filter((c) => (c.status as string) !== "deleted" && (c.status as string) !== "inactive");
  let fBatches = batchesData.filter((b) => ((b as any).status as string) !== "deleted" && ((b as any).status as string) !== "inactive");
  let fStudents = studentsData.filter((s) => (s.status as string) !== "deleted" && (s.status as string) !== "inactive");
  let fExams = examsData.filter((e) => (e.status as string) !== "deleted" && (e.status as string) !== "inactive");
  let fResources = resourcesData.filter((r) => ((r as any).status as string) !== "deleted" && ((r as any).status as string) !== "inactive");
  let fAttempts = attemptsData;

  try {
    const uStr = typeof window !== "undefined" ? localStorage.getItem("lms_user") || localStorage.getItem("user") : null;
    const role = typeof window !== "undefined" ? localStorage.getItem("lms_role") : null;

    if (uStr) {
      const parsed = JSON.parse(uStr);
      const r = (role || parsed.role || "").toLowerCase();

      if (r === "college_admin" && parsed.collegeId) {
        fColleges = fColleges.filter((c) => c.id === parsed.collegeId);
        fStudents = fStudents.filter((s) => s.collegeId === parsed.collegeId);

        const validStudentIds = new Set(fStudents.map((s) => s.id));
        const validStudentBatchIds = new Set(fStudents.flatMap((s) => s.batchIds || []));

        fBatches = fBatches.filter((b) => b.collegeId === parsed.collegeId || validStudentBatchIds.has(b.id));

        fExams = fExams.filter((e) => {
          if (!e.targets) return false;
          return e.targets.some((t) => {
            if (t.type === "composite") {
              return t.collegeId === parsed.collegeId || (t.batchId && validStudentBatchIds.has(t.batchId));
            }
            if (t.type === "college") return t.ids.includes(parsed.collegeId);
            if (t.type === "batch") return t.ids.some((b) => validStudentBatchIds.has(b));
            if (t.type === "students") return t.ids.some((s) => validStudentIds.has(s));
            return false;
          });
        });

        fResources = fResources.filter((res) => {
          if (!res.targets) return false;
          return res.targets.some((t) => {
            if (t.type === "composite") {
              return t.collegeId === parsed.collegeId || (t.batchId && validStudentBatchIds.has(t.batchId));
            }
            if (t.type === "college") return t.ids?.includes(parsed.collegeId);
            if (t.type === "batch") return t.ids?.some((b: string) => validStudentBatchIds.has(b));
            if (t.type === "students") return t.ids?.some((s: string) => validStudentIds.has(s));
            return false;
          });
        });

        fAttempts = fAttempts.filter((a) => validStudentIds.has(a.studentId));
      } else if (r === "student" && parsed.id) {
        if (parsed.collegeId) {
          fColleges = fColleges.filter((c) => c.id === parsed.collegeId);
          fStudents = fStudents.filter((s) => s.collegeId === parsed.collegeId);
          const validStudentBatchIds = new Set(fStudents.flatMap((s) => s.batchIds || []));
          fBatches = fBatches.filter((b) => b.collegeId === parsed.collegeId || validStudentBatchIds.has(b.id));
        }
        fAttempts = fAttempts.filter((a) => a.studentId === parsed.id || a.studentId === parsed.email);
      }
    }
  } catch (_) {}

  // Dynamically compute accurate student counts for colleges and batches based on current students
  fColleges = fColleges.map((c) => ({
    ...c,
    studentCount: fStudents.filter((s) => s.collegeId === c.id).length,
  }));

  fBatches = fBatches.map((b) => ({
    ...b,
    studentCount: fStudents.filter((s) => s.batchIds?.includes(b.id)).length,
  }));

  cache.filteredColleges = fColleges;
  cache.filteredBatches = fBatches;
  cache.filteredStudents = fStudents;
  cache.filteredExams = fExams;
  cache.filteredResources = fResources;
  cache.filteredAttempts = fAttempts;

  cache.hierarchy = buildHierarchy(fColleges, fBatches, fStudents);

  if (cache.colleges || cache.students || cache.exams || cache.resources || cache.batches || cache.attempts) {
    cache.loading = false;
  }
}

function notifyListeners() {
  computeExportedState();
  callbacks.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error("LMS cache listener error:", err);
    }
  });
}

const callbacks = new Set<() => void>();
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeToLMSCache(callback: () => void): () => void {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }

  callbacks.add(callback);
  if (cache.listeners === 0) {
    startSubscriptions();
  }
  cache.listeners++;

  return () => {
    callbacks.delete(callback);
    cache.listeners = Math.max(0, cache.listeners - 1);
    if (cache.listeners === 0) {
      cleanupTimer = setTimeout(() => {
        if (cache.listeners === 0) {
          stopSubscriptions();
        }
      }, 5000); // 5s grace period to keep subscriptions warm during route transitions
    }
  };
}

function startSubscriptions() {
  cache.loading = true;
  cache.error = null;

  let uStr: string | null = null;
  let role: string = "";
  let parsed: any = null;

  if (typeof window !== "undefined") {
    uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
    if (uStr) {
      try {
        parsed = JSON.parse(uStr);
        if (parsed.role) role = parsed.role.toLowerCase();
      } catch (e) {}
    }
    if (!role) {
      role = localStorage.getItem("lms_role")?.toLowerCase() || "admin";
    }
  }

  const isCollegeAdmin = role === "college_admin" && parsed?.collegeId;
  const isStudent = role === "student" && parsed?.id;

  const unsubColleges = subscribeToAllColleges((data) => {
    cache.colleges = { data, updatedAt: Date.now() };
    recomputeScopedData();
    notifyListeners();
  });

  const unsubBatches = isCollegeAdmin 
    ? subscribeToBatchesByCollege(parsed.collegeId, (data) => {
        cache.batches = { data, updatedAt: Date.now() };
        recomputeScopedData();
        notifyListeners();
      })
    : subscribeToAllBatches((data) => {
        cache.batches = { data, updatedAt: Date.now() };
        recomputeScopedData();
        notifyListeners();
      });

  const unsubStudents = isCollegeAdmin
    ? subscribeToStudentsByCollege(parsed.collegeId, (data) => {
        cache.students = { data, updatedAt: Date.now() };
        recomputeScopedData();
        notifyListeners();
      })
    : subscribeToAllStudents((data) => {
        cache.students = { data, updatedAt: Date.now() };
        recomputeScopedData();
        notifyListeners();
      });

  const unsubExams = subscribeToAllExams((data) => {
    cache.exams = { data, updatedAt: Date.now() };
    recomputeScopedData();
    notifyListeners();
  });

  const unsubResources = subscribeToAllResources((data) => {
    cache.resources = { data, updatedAt: Date.now() };
    recomputeScopedData();
    notifyListeners();
  });

  const unsubAttempts = subscribeToAllAttempts((data) => {
    cache.attempts = { data, updatedAt: Date.now() };
    recomputeScopedData();
    notifyListeners();
  });

  cache.unsubscribers = [
    unsubColleges, unsubBatches, unsubStudents, unsubExams, unsubResources, unsubAttempts
  ];
}

function stopSubscriptions() {
  cache.unsubscribers.forEach((unsub) => unsub());
  cache.unsubscribers = [];
}

function computeExportedState() {
  const hierarchy = cache.hierarchy;
  const colleges = hierarchy?.colleges || [];
  const students = hierarchy?.students || [];

  const externals = getExternalInstitutions(students, colleges);

  const officialInstitutions: Institution[] = colleges.map((c) => ({
    id: c.id,
    name: safeDisplayName(c.name, c.id, "Unknown Institution"),
    type: "official",
    code: c.code,
    departments: c.departments,
    isDeleted: c.isDeleted,
  }));

  const institutions: Institution[] = [
    ...officialInstitutions,
    ...externals,
  ];

  const institutionOptions: SelectOption[] = institutions.map((inst) =>
    inst.isDeleted
      ? { label: `${inst.name} (Deleted)`, value: inst.id }
      : { label: inst.name, value: inst.id }
  );

  // We explicitly omit the internal properties and only expose what's needed
  cache._exportedState = {
    colleges: cache.colleges?.data || [],
    batches: cache.batches?.data || [],
    students: cache.students?.data || [],
    exams: cache.exams?.data || [],
    resources: cache.resources?.data || [],
    attempts: cache.attempts?.data || [],
    rawColleges: cache.rawColleges,
    filteredColleges: cache.filteredColleges,
    filteredBatches: cache.filteredBatches,
    filteredStudents: cache.filteredStudents,
    filteredExams: cache.filteredExams,
    filteredResources: cache.filteredResources,
    filteredAttempts: cache.filteredAttempts,
    error: cache.error,
    loading: cache.loading,
    hierarchy,
    institutions,
    externalInstitutions: externals,
    institutionOptions,
    getInstitutionName: (id: string) => resolveInstitutionName(institutions, id),
  };

  setLMSStoreState(cache._exportedState);
}

export function getLMSCache() {
  if (!cache._exportedState) {
    computeExportedState();
  }
  return cache._exportedState;
}

export function invalidateLMSCache(): void {
  stopSubscriptions();
  cache.colleges = null;
  cache.batches = null;
  cache.students = null;
  cache.exams = null;
  cache.resources = null;
  cache.attempts = null;
  cache.hierarchy = null;
  cache.error = null;
  cache.filteredColleges = [];
  cache.filteredBatches = [];
  cache.filteredStudents = [];
  cache.filteredExams = [];
  cache.filteredResources = [];
  cache.filteredAttempts = [];
  cache.listeners = 0;
  callbacks.clear();
}
