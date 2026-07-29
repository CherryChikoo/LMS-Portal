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
  subscribeToStudentById,
  getStudentsByCollege,
  getBatchesByCollege,
} from "@/lib/services";
import { getStudentAttempts, subscribeToStudentAttempts } from "@/lib/services";
import {
  buildHierarchy,
  getExternalInstitutions,
  getInstitutionName as resolveInstitutionName,
  safeDisplayName,
  markCollegeAsDeleted,
  deletedCollegesSet,
  type Hierarchy,
  type Institution,
} from "@/lib/hierarchy/hierarchy-data";
import type { College, Batch, Student, SelectOption, Exam, Resource, ExamAttempt } from "@/types";
import { setLMSStoreState } from "./lms-store";
import { logger } from "@/lib/utils/logger";

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

const CACHE_STORAGE_KEY = "lms_data_cache_v3";

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistCacheToStorage() {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const payload = {
        colleges: cache.colleges?.data || [],
        batches: cache.batches?.data || [],
        students: cache.students?.data || [],
        exams: cache.exams?.data || [],
        resources: cache.resources?.data || [],
        attempts: cache.attempts?.data || [],
      };
      const serialized = JSON.stringify(payload);
      localStorage.setItem(CACHE_STORAGE_KEY, serialized);
    } catch (_) {}
  }, 300);
}

function hydrateCacheFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY) || sessionStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const isActive = (d: any) => !d.isDeleted && !d.deletedAt && d.status !== "deleted" && d.status !== "inactive";
    if (parsed && typeof parsed === "object") {
      const now = Date.now();
      if (Array.isArray(parsed.colleges) && parsed.colleges.length > 0) cache.colleges = { data: parsed.colleges.filter(isActive), updatedAt: now };
      if (Array.isArray(parsed.batches) && parsed.batches.length > 0) cache.batches = { data: parsed.batches.filter(isActive), updatedAt: now };
      if (Array.isArray(parsed.students) && parsed.students.length > 0) cache.students = { data: parsed.students.filter(isActive), updatedAt: now };
      if (Array.isArray(parsed.exams) && parsed.exams.length > 0) cache.exams = { data: parsed.exams.filter(isActive), updatedAt: now };
      if (Array.isArray(parsed.resources) && parsed.resources.length > 0) cache.resources = { data: parsed.resources.filter(isActive), updatedAt: now };
      if (Array.isArray(parsed.attempts) && parsed.attempts.length > 0) cache.attempts = { data: parsed.attempts.filter(isActive), updatedAt: now };

      if (cache.colleges || cache.students || cache.batches || cache.exams || cache.resources || cache.attempts) {
        cache.loading = false;
        recomputeScopedData();
      }
    }
  } catch (_) {}
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

if (typeof window !== "undefined") {
  hydrateCacheFromStorage();
}

function recomputeScopedData() {
  const collegesData = cache.colleges?.data || [];
  const batchesData = cache.batches?.data || [];
  const studentsData = cache.students?.data || [];
  const examsData = cache.exams?.data || [];
  const resourcesData = cache.resources?.data || [];
  const attemptsData = cache.attempts?.data || [];

  cache.rawColleges = collegesData;

  const isCollegeDeleted = (colId?: string, colName?: string) => {
    if (colId && deletedCollegesSet.has(colId.toLowerCase().trim())) return true;
    if (colName && deletedCollegesSet.has(colName.toLowerCase().trim())) return true;
    return false;
  };

  const isActive = (d: any) => !d.isDeleted && !d.deletedAt && d.status !== "deleted" && d.status !== "inactive";

  let fColleges = collegesData.filter((c) => isActive(c) && !isCollegeDeleted(c.id, c.name));
  let fBatches = batchesData.filter(isActive);
  let fStudents = studentsData.filter((s) => isActive(s) && !isCollegeDeleted(s.collegeId, s.collegeName));
  let fExams = examsData.filter(isActive);
  let fResources = resourcesData.filter(isActive);
  let fAttempts = attemptsData.filter(isActive);

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
  persistCacheToStorage();
}

function notifyListeners() {
  computeExportedState();
  callbacks.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      logger.error("CACHE", "LMS cache listener error:", err);
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
  if (!cache.colleges && !cache.students && !cache.exams && !cache.batches) {
    cache.loading = true;
  }
  cache.error = null;

  import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
    import("@/lib/firebase/config").then(({ app }) => {
      const auth = getAuth(app);
      
      const authUnsub = onAuthStateChanged(auth, async (user) => {
        // Clear old ones if auth state changes
        cache.unsubscribers.forEach((u) => u());
        cache.unsubscribers = [];
        
        if (!user) {
          cache.loading = false;
          notifyListeners();
          return;
        }

        let parsed: any = null;
        let role: string = "";

        try {
          const { getFirestore, doc, getDoc } = await import("firebase/firestore");
          const db = getFirestore(app);
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            parsed = { id: user.uid, ...userDoc.data() };
            role = parsed.role?.toLowerCase() || "admin";
          } else {
            const studentDoc = await getDoc(doc(db, "students", user.uid));
            if (studentDoc.exists()) {
              parsed = { id: user.uid, ...studentDoc.data() };
              role = "student";
            }
          }

          if (parsed) {
            // Sync with localStorage
            if (typeof window !== "undefined") {
              localStorage.setItem("lms_user", JSON.stringify(parsed));
              localStorage.setItem("user", JSON.stringify(parsed));
              localStorage.setItem("lms_role", role);
              
              // Ensure cookie is synced for middleware
              const isSecure = window.location.protocol === "https:";
              const cookieOptions = `path=/; max-age=86400; SameSite=Lax${isSecure ? "; Secure" : ""}`;
              document.cookie = `lms_role=${role}; ${cookieOptions}`;
            }
          }
        } catch (e) {
          logger.error("CACHE", "Failed to fetch user document for auth sync", e);
        }

        if (!parsed && typeof window !== "undefined") {
          const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
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

        const unsubBatches = subscribeToAllBatches((data) => {
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
          : isStudent
          ? subscribeToStudentById(parsed.id, (data) => {
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

        const unsubAttempts = isStudent
          ? subscribeToStudentAttempts(parsed.id, (data) => {
              cache.attempts = { data, updatedAt: Date.now() };
              recomputeScopedData();
              notifyListeners();
            })
          : subscribeToAllAttempts((data) => {
              cache.attempts = { data, updatedAt: Date.now() };
              recomputeScopedData();
              notifyListeners();
            });

        cache.unsubscribers.push(
          unsubColleges, unsubBatches, unsubStudents, unsubExams, unsubResources, unsubAttempts
        );
      });

      cache.unsubscribers.push(authUnsub);
    });
  });
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

export function optimisticDeleteCollegeFromCache(collegeId: string): void {
  markCollegeAsDeleted(collegeId);
  if (cache.colleges?.data) {
    const colObj = cache.colleges.data.find(
      (c) => c.id === collegeId || c.name.toLowerCase() === collegeId.toLowerCase()
    );
    const targetId = colObj?.id || collegeId;
    const targetName = (colObj?.name || collegeId).toLowerCase();
    markCollegeAsDeleted(targetId);
    markCollegeAsDeleted(targetName);

    const isMatch = (id?: string, name?: string) => {
      if (id && (id === targetId || id.toLowerCase() === targetName)) return true;
      if (name && name.toLowerCase() === targetName) return true;
      return false;
    };

    cache.colleges.data = cache.colleges.data.filter((c) => !isMatch(c.id, c.name));
  }
  if (cache.students?.data) {
    const targetId = collegeId;
    const targetName = collegeId.toLowerCase();
    const isMatch = (id?: string, name?: string) => {
      if (id && (id === targetId || id.toLowerCase() === targetName)) return true;
      if (name && name.toLowerCase() === targetName) return true;
      return false;
    };
    cache.students.data = cache.students.data.filter((s) => !isMatch(s.collegeId, s.collegeName));
  }
  recomputeScopedData();
  notifyListeners();
}

export function optimisticDeleteStudentFromCache(studentId: string): void {
  if (cache.students?.data) {
    cache.students.data = cache.students.data.filter((s) => s.id !== studentId);
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticUpdateStudentInCache(studentId: string, updates: Partial<Student>): void {
  if (cache.students?.data) {
    cache.students.data = cache.students.data.map((s) => (s.id === studentId ? { ...s, ...updates } : s));
    recomputeScopedData();
    notifyListeners();
  }
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
