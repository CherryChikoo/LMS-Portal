import {
  getAllColleges,
  getAllBatches,
  getAllStudents,
  getAllExams,
  getAllResources,
  getStudentsByCollege,
  getBatchesByCollege,
  getStudentAttempts,
} from "@/lib/services";
import { getDocuments, type QueryOptions, where } from "@/lib/firebase/firestore";
import {
  buildHierarchy,
  getExternalInstitutions,
  isStudentInCollege,
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

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Configuration ───────────────────────────────────────────────────────────

const CACHE_STORAGE_KEY = "lms_data_cache_v4";
/** How often to poll Firestore for fresh data (in ms). 30 seconds for responsive updates. */
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds (was 5 minutes)

// ─── localStorage Persistence ────────────────────────────────────────────────

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
    const isActive = (d: { isDeleted?: boolean; deletedAt?: Date; status?: string }) => !d.isDeleted && !d.deletedAt && d.status !== "deleted" && d.status !== "inactive";
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

// ─── Cache State ─────────────────────────────────────────────────────────────

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

// ─── Recompute & Filtering ───────────────────────────────────────────────────

function recomputeScopedData() {
  const collegesData = cache.colleges?.data || [];
  const batchesData = cache.batches?.data || [];
  const studentsData = cache.students?.data || [];
  const examsData = cache.exams?.data || [];
  const resourcesData = cache.resources?.data || [];
  const attemptsData = cache.attempts?.data || [];

  cache.rawColleges = collegesData;

  // Reconcile deletedCollegesSet: if a college exists in the live Firestore data,
  // it was re-created after being deleted. Remove it from the blacklist.
  // Uses slug-based fuzzy matching to handle format variations
  if (deletedCollegesSet.size > 0) {
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const liveSlugs = new Set<string>();
    collegesData.forEach((c) => {
      if (c.id) liveSlugs.add(slugify(c.id));
      if (c.name) liveSlugs.add(slugify(c.name));
    });

    let changed = false;
    for (const key of deletedCollegesSet) {
      const slugKey = slugify(key);
      if (!slugKey) { deletedCollegesSet.delete(key); changed = true; continue; }

      let matched = false;
      for (const liveSlug of liveSlugs) {
        if (!liveSlug) continue;
        if (slugKey === liveSlug || slugKey.includes(liveSlug) || liveSlug.includes(slugKey)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        deletedCollegesSet.delete(key);
        changed = true;
      }
    }
    if (changed && typeof window !== "undefined") {
      try {
        localStorage.setItem("lms_deleted_colleges", JSON.stringify(Array.from(deletedCollegesSet)));
      } catch (_) {}
    }
  }

  const isCollegeDeleted = (colId?: string, colName?: string) => {
    if (colId && deletedCollegesSet.has(colId.toLowerCase().trim())) return true;
    if (colName && deletedCollegesSet.has(colName.toLowerCase().trim())) return true;
    return false;
  };

  const isActive = (d: { isDeleted?: boolean; deletedAt?: Date; status?: string }) => !d.isDeleted && !d.deletedAt && d.status !== "deleted" && d.status !== "inactive";

  let fColleges = collegesData.filter((c) => isActive(c) && !isCollegeDeleted(c.id, c.name));
  let fBatches = batchesData.filter(isActive);
  const fStudents = studentsData.filter((s) => isActive(s) && !isCollegeDeleted(s.collegeId, s.collegeName));
  
  // Filter exams: Check for deleted colleges AND apply college-scoping for college admins
  let fExams = examsData.filter((e) => {
    if (!isActive(e)) return false;
    const eColId = e.collegeId || e.targets?.[0]?.collegeId;
    const eColName = e.collegeName || e.targets?.[0]?.collegeName;
    if (eColId || eColName) {
      if (isCollegeDeleted(eColId, eColName)) return false;
    }
    return true;
  });
  
  let fResources = resourcesData.filter((r) => {
    if (!isActive(r as any)) return false;
    const rColId = r.collegeId || r.targets?.[0]?.collegeId;
    const rColName = r.collegeName || r.targets?.[0]?.collegeName;
    if (rColId || rColName) {
      if (isCollegeDeleted(rColId, rColName)) return false;
    }
    return true;
  });
  const fAttempts = attemptsData.filter(isActive);

  try {
    const uStr = typeof window !== "undefined" ? localStorage.getItem("lms_user") || localStorage.getItem("user") : null;
    const role = typeof window !== "undefined" ? localStorage.getItem("lms_role") : null;

    if (uStr) {
      const parsed = JSON.parse(uStr);
      const r = (role || parsed.role || "").toLowerCase();

      if ((r === "college_admin" || r === "student") && (parsed.collegeId || parsed.collegeName)) {
        const dummyStudent = { collegeId: parsed.collegeId, collegeName: parsed.collegeName || parsed.collegeId } as Student;
        const matched = fColleges.filter((c) => isStudentInCollege(dummyStudent, c));
        if (matched.length > 0) {
          fColleges = matched;
        }
        
        // Filter exams for college admins and students
        // Include exams that are:
        // 1. Assigned to their college (collegeId matches)
        // 2. Global exams (collegeId === "global" or "GLOBAL" or targets includes "global")
        // 3. Exams with targets array that includes their college
        const userCollegeId = parsed.collegeId;
        const userCollegeName = parsed.collegeName;
        
        // Filter exams for college admins and students
        // Include exams that are:
        // 1. Assigned to their college (collegeId matches)
        // 2. Global exams (collegeId === "global" or "GLOBAL")
        // 3. Exams with targets array that includes their college or "global"
        fExams = fExams.filter((exam) => {
          const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
          const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
          
          if (isGlobal) return true;
          
          // Direct college match
          if (tCol === userCollegeId) return true;
          
          // Check targets array
          if (exam.targets && Array.isArray(exam.targets)) {
            // Global target
            if (exam.targets.some(t => 
              t.ids?.includes("global") || 
              t.ids?.includes("GLOBAL") ||
              t.names?.includes("global") ||
              t.names?.includes("GLOBAL") ||
              t.collegeId === "global" || t.collegeId === "GLOBAL" || t.collegeId === "all" || t.collegeId === "ALL"
            )) return true;
            
            // College-specific target
            if (exam.targets.some(t => 
              t.collegeId === userCollegeId ||
              t.ids?.includes(userCollegeId) ||
              (t.names && userCollegeName && t.names.some(n => 
                n.toLowerCase() === userCollegeName.toLowerCase()
              ))
            )) return true;
          }
          
          return false;
        });
        
        // Filter resources for college admins and students (same logic as exams)
        // Include resources that are:
        // 1. Assigned to their college (collegeId matches)
        // 2. Global resources (collegeId === "global" or "GLOBAL")
        // 3. Resources with sharedWith/targets that includes their college or "global"
        fResources = fResources.filter((resource) => {
          const tCol = resource.collegeId || resource.targets?.[0]?.collegeId;
          const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
          
          if (isGlobal) return true;
          
          if (tCol === userCollegeId) return true;
          
          // Check sharedWith array (legacy field)
          if (resource.sharedWith && Array.isArray(resource.sharedWith)) {
            if (resource.sharedWith.includes("global") || 
                resource.sharedWith.includes("GLOBAL") ||
                resource.sharedWith.includes("all") ||
                resource.sharedWith.includes("*")) return true;
                
            if (resource.sharedWith.includes(userCollegeId)) return true;
            
            if (userCollegeName && resource.sharedWith.some(s => 
              s.toLowerCase() === userCollegeName.toLowerCase()
            )) return true;
          }
          
          // Check targets array (same as exams)
          if (resource.targets && Array.isArray(resource.targets)) {
            // Global target
            if (resource.targets.some(t => 
              t.ids?.includes("global") || 
              t.ids?.includes("GLOBAL") ||
              t.names?.includes("global") ||
              t.names?.includes("GLOBAL") ||
              t.collegeId === "global" || t.collegeId === "GLOBAL" || t.collegeId === "all" || t.collegeId === "ALL"
            )) return true;
            
            // College-specific target
            if (resource.targets.some(t => 
              t.collegeId === userCollegeId ||
              t.ids?.includes(userCollegeId) ||
              (t.names && userCollegeName && t.names.some(n => 
                n.toLowerCase() === userCollegeName.toLowerCase()
              ))
            )) return true;
          }
          
          return false;
        });
      }
    }
  } catch (_) {}

  // Dynamically compute accurate student counts for colleges and batches
  fColleges = fColleges.map((c) => ({
    ...c,
    studentCount: fStudents.filter((s) => isStudentInCollege(s, c)).length,
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

// ─── Debounced Recompute + Notify ────────────────────────────────────────────

let recomputeTimer: ReturnType<typeof setTimeout> | null = null;

/** Batch multiple rapid data updates into a single recompute + notify cycle. */
function debouncedRecomputeAndNotify() {
  if (recomputeTimer) clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => {
    recomputeScopedData();
    notifyListeners();
  }, 50);
}

// ─── Listener Management ─────────────────────────────────────────────────────

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
    startPolling();
  }
  cache.listeners++;

  return () => {
    callbacks.delete(callback);
    cache.listeners = Math.max(0, cache.listeners - 1);
    if (cache.listeners === 0) {
      cleanupTimer = setTimeout(() => {
        if (cache.listeners === 0) {
          stopPolling();
        }
      }, 5000);
    }
  };
}

// ─── Polling Engine (replaces onSnapshot listeners) ──────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isFetching = false;
let currentUserInfo: { uid: string; role: string; collegeId?: string; parsed: any } | null = null;

/**
 * One-shot fetch of ALL collections using getDocs (not onSnapshot).
 * Each document read counts as 1 read. No ongoing listener cost.
 */
async function fetchAllData() {
  if (isFetching || !currentUserInfo) return;
  isFetching = true;

  const { role, collegeId, parsed } = currentUserInfo;
  const isMainAdmin = role === "main_admin" || role === "admin" || role === "superadmin" || role === "trainer";
  const isCollegeAdmin = role === "college_admin" && collegeId;
  const isStudent = role === "student" && parsed?.id;

  try {
    // Fetch all collections in parallel (single round-trip per collection)
    const [collegesRes, batchesRes, studentsRes, examsRes, resourcesRes, attemptsRes] = await Promise.all([
      // Colleges: always fetch all (small collection)
      getAllColleges({ pageSize: 200 }),

      // Batches: scope by college for non-admins
      (isCollegeAdmin || isStudent) && collegeId
        ? getBatchesByCollege(collegeId, { pageSize: 500 })
        : isMainAdmin
        ? getAllBatches({ pageSize: 500 })
        : Promise.resolve({ data: [], lastDoc: null }),

      // Students: scope by college for non-admins
      isStudent && collegeId
        ? getStudentsByCollege(collegeId, { pageSize: 1000 })
        : isCollegeAdmin && collegeId
        ? getStudentsByCollege(collegeId, { pageSize: 2000 })
        : isMainAdmin
        ? getAllStudents({ pageSize: 5000 })
        : Promise.resolve({ data: [], lastDoc: null }),

      // Exams: scope by college for non-admins
      // College admins need exams that are:
      // 1. Directly assigned to their college (collegeId === their college)
      // 2. Global exams (collegeId === "global")
      // 3. Exams with targets array that includes their college
      (isStudent || isCollegeAdmin) && collegeId
        ? getAllExams({ pageSize: 2000 }) // Fetch all, filter client-side for college admins
        : isMainAdmin
        ? getAllExams({ pageSize: 2000 })
        : Promise.resolve({ data: [], lastDoc: null }),

      // Resources: Fetch all resources for college admins/students, filter client-side
      // This allows global resources and college-specific resources to be shown
      (isCollegeAdmin || isStudent) && collegeId
        ? getAllResources({ pageSize: 2000 }) // Fetch all, filter client-side
        : isMainAdmin
        ? getAllResources({ pageSize: 2000 })
        : Promise.resolve({ data: [], lastDoc: null }),

      // Attempts: scope by student or college
      isStudent && parsed?.id
        ? getDocuments<ExamAttempt>("exam_results", [where("studentId", "==", parsed.id)], false, { pageSize: 500 })
        : isCollegeAdmin && collegeId
        ? getDocuments<ExamAttempt>("exam_results", [where("collegeId", "==", collegeId)], false, { pageSize: 2000 })
        : isMainAdmin
        ? getDocuments<ExamAttempt>("exam_results", [], false, { pageSize: 5000 })
        : Promise.resolve({ data: [], lastDoc: null }),
    ]);

    const now = Date.now();
    cache.colleges = { data: collegesRes.data, updatedAt: now };
    cache.batches = { data: batchesRes.data, updatedAt: now };
    cache.students = { data: studentsRes.data, updatedAt: now };
    cache.exams = { data: examsRes.data, updatedAt: now };
    cache.resources = { data: resourcesRes.data, updatedAt: now };
    cache.attempts = { data: attemptsRes.data, updatedAt: now };
    cache.error = null;

    recomputeScopedData();
    notifyListeners();
  } catch (err: any) {
    logger.error("CACHE", "fetchAllData failed:", err);
    cache.error = err;
    // Don't overwrite cached data on error — show stale data rather than nothing
  } finally {
    isFetching = false;
  }
}

function startPolling() {
  if (!cache.colleges && !cache.students && !cache.exams && !cache.batches) {
    cache.loading = true;
  }
  cache.error = null;

  import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
    import("@/lib/firebase/config").then(({ app }) => {
      const auth = getAuth(app);
      
      const authUnsub = onAuthStateChanged(auth, async (user) => {
        // Clear polling on auth state change
        stopPolling();
        
        if (!user) {
          cache.loading = false;
          currentUserInfo = null;
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
            if (typeof window !== "undefined") {
              localStorage.setItem("lms_user", JSON.stringify(parsed));
              localStorage.setItem("user", JSON.stringify(parsed));
              localStorage.setItem("lms_role", role);
              
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

        const isMainAdmin = role === "main_admin" || role === "admin" || role === "superadmin" || role === "trainer";

        // AUTH READINESS GUARD: Prevent race condition where queries fire before collegeId resolves
        if (!isMainAdmin && !parsed?.collegeId) {
          return;
        }

        // Store user info for polling
        currentUserInfo = { uid: user.uid, role, collegeId: parsed?.collegeId, parsed };

        // Do initial fetch immediately
        await fetchAllData();

        // Start polling interval
        if (!pollTimer) {
          pollTimer = setInterval(() => {
            fetchAllData();
          }, POLL_INTERVAL_MS);
        }
      });

      cache.unsubscribers.push(authUnsub);
    });
  });
}

function stopPolling() {
  // Stop the poll timer
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  // Stop any lingering unsubscribers (auth listener)
  cache.unsubscribers.forEach((unsub) => unsub());
  cache.unsubscribers = [];
}

// ─── Exported State Computation ──────────────────────────────────────────────

function computeExportedState() {
  const hierarchy = cache.hierarchy;
  const colleges = hierarchy?.colleges || [];
  const students = hierarchy?.students || [];

  const externals = getExternalInstitutions(students, colleges);

  const officialInstitutions: Institution[] = colleges.map((c) => ({
    id: c.id,
    name: safeDisplayName(c.name ? c.name.toLowerCase() : "", c.id, "Unknown Institution").toLowerCase(),
    type: "official",
    code: c.code,
    departments: c.departments,
    isDeleted: c.isDeleted,
    studentCount: students.filter((s) => isStudentInCollege(s, c)).length,
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

// ─── Public API: Manual Refresh ──────────────────────────────────────────────

/**
 * Force an immediate refresh of all cached data from Firestore.
 * Call this after mutations (create/update/delete) to get fresh data without
 * waiting for the next poll interval.
 */
export async function refreshCache(): Promise<void> {
  await fetchAllData();
}

// ─── Optimistic Updates ──────────────────────────────────────────────────────

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
  if (cache.exams?.data) {
    cache.exams.data = cache.exams.data.filter((e) => {
      const eColId = e.collegeId || e.targets?.[0]?.collegeId;
      const eColName = e.collegeName || e.targets?.[0]?.collegeName;
      if (eColId && (eColId === collegeId || eColId.toLowerCase() === collegeId.toLowerCase())) return false;
      if (eColName && eColName.toLowerCase() === collegeId.toLowerCase()) return false;
      return true;
    });
  }
  if (cache.resources?.data) {
    cache.resources.data = cache.resources.data.filter((r) => {
      const rColId = r.collegeId || r.targets?.[0]?.collegeId;
      const rColName = r.collegeName || r.targets?.[0]?.collegeName;
      if (rColId && (rColId === collegeId || rColId.toLowerCase() === collegeId.toLowerCase())) return false;
      if (rColName && rColName.toLowerCase() === collegeId.toLowerCase()) return false;
      return true;
    });
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
  stopPolling();
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
  currentUserInfo = null;
}
