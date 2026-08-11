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
/** Base fallback poll interval */
const DEFAULT_POLL_INTERVAL_MS = 60 * 1000;

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
  
  // HMR Cleanup: Clean up orphaned listeners from previous module evaluations during Fast Refresh
  if ((window as any).__lms_unsubs) {
    (window as any).__lms_unsubs.forEach((u: any) => { try { u(); } catch(e) {} });
  }
  (window as any).__lms_unsubs = [];
  
  if ((window as any).__lms_auth_unsub) {
    try { (window as any).__lms_auth_unsub(); } catch(e) {}
  }
}

let changedTypes = new Set<string>();

let recomputeTimer: NodeJS.Timeout | null = null;
function debouncedRecomputeAndNotify(type?: "colleges" | "batches" | "students" | "exams" | "resources" | "attempts") {
  if (type) changedTypes.add(type);
  else {
    // If no type provided, assume all changed
    ["colleges", "batches", "students", "exams", "resources", "attempts"].forEach(t => changedTypes.add(t));
  }
  
  if (recomputeTimer) clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => {
    recomputeScopedData();
    notifyListeners();
  }, 50);
}

function recomputeScopedData() {
  const needsAll = changedTypes.has("colleges") || changedTypes.has("students") || changedTypes.has("batches");
  
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
    if (colId && (colId.toLowerCase().trim() === "global" || colId.toLowerCase().trim() === "unassigned")) return false;
    if (colName && (colName.toLowerCase().trim() === "global" || colName.toLowerCase().trim() === "unassigned")) return false;
    
    if (colId && deletedCollegesSet.has(colId.toLowerCase().trim())) return true;
    if (colName && deletedCollegesSet.has(colName.toLowerCase().trim())) return true;
    return false;
  };

  const isActive = (d: { isDeleted?: boolean; deletedAt?: Date; status?: string }) => !d.isDeleted && !d.deletedAt && d.status !== "deleted" && d.status !== "inactive";

  let fColleges = collegesData.filter((c) => isActive(c) && !isCollegeDeleted(c.id, c.name));
  let fBatches = batchesData.filter(isActive);
  const fStudents = studentsData.filter((s) => isActive(s) && !isCollegeDeleted(s.collegeId, s.collegeName));
  const activeStudentIds = new Set(fStudents.map((s) => s.id));
  
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
  
  // Aggressively filter out attempts belonging to deleted students or ghost data
  const fAttempts = attemptsData.filter((att) => isActive(att as any) && activeStudentIds.has(att.studentId));

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
          if (userCollegeId && tCol === userCollegeId) return true;
          if (userCollegeName && tCol.toLowerCase() === userCollegeName.toLowerCase()) return true;
          
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
            if (exam.targets.some(t => {
              if (userCollegeId && t.collegeId === userCollegeId) return true;
              if (userCollegeName && t.collegeId?.toLowerCase() === userCollegeName.toLowerCase()) return true;
              if (userCollegeId && t.ids?.includes(userCollegeId)) return true;
              if (userCollegeName && t.ids?.some(id => id.toLowerCase() === userCollegeName.toLowerCase())) return true;
              if (userCollegeName && t.names?.some(n => n.toLowerCase() === userCollegeName.toLowerCase())) return true;
              return false;
            })) return true;
          }
          
          return false;
        });
        
        // Filter resources for college admins and students (same logic as exams)
        fResources = fResources.filter((resource) => {
          const tCol = resource.collegeId || resource.targets?.[0]?.collegeId;
          const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
          
          if (isGlobal) return true;
          
          if (userCollegeId && tCol === userCollegeId) return true;
          if (userCollegeName && tCol.toLowerCase() === userCollegeName.toLowerCase()) return true;
          
          // Check sharedWith array (legacy field)
          if (resource.sharedWith && Array.isArray(resource.sharedWith)) {
            if (resource.sharedWith.includes("global") || 
                resource.sharedWith.includes("GLOBAL") ||
                resource.sharedWith.includes("all") ||
                resource.sharedWith.includes("*")) return true;
                
            if (userCollegeId && resource.sharedWith.includes(userCollegeId)) return true;
            if (userCollegeName && resource.sharedWith.some(s => s.toLowerCase() === userCollegeName.toLowerCase())) return true;
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
            if (resource.targets.some(t => {
              if (userCollegeId && t.collegeId === userCollegeId) return true;
              if (userCollegeName && t.collegeId?.toLowerCase() === userCollegeName.toLowerCase()) return true;
              if (userCollegeId && t.ids?.includes(userCollegeId)) return true;
              if (userCollegeName && t.ids?.some(id => id.toLowerCase() === userCollegeName.toLowerCase())) return true;
              if (userCollegeName && t.names?.some(n => n.toLowerCase() === userCollegeName.toLowerCase())) return true;
              return false;
            })) return true;
          }
          
          return false;
        });
      }
    }
  } catch (_) {}

  // Pre-compute student counts to avoid O(N*M) filtering
  const filteredStudentCountByColId = new Map<string, number>();
  const filteredStudentCountByColName = new Map<string, number>();
  const filteredStudentCountByBatchId = new Map<string, number>();

  fStudents.forEach((s) => {
    if (s.collegeId) {
      const id = s.collegeId.toLowerCase();
      filteredStudentCountByColId.set(id, (filteredStudentCountByColId.get(id) || 0) + 1);
    }
    if (s.collegeName) {
      const name = s.collegeName.toLowerCase();
      filteredStudentCountByColName.set(name, (filteredStudentCountByColName.get(name) || 0) + 1);
    }
    if (s.batchIds && Array.isArray(s.batchIds)) {
      s.batchIds.forEach(bId => {
        filteredStudentCountByBatchId.set(bId, (filteredStudentCountByBatchId.get(bId) || 0) + 1);
      });
    }
  });

  // Dynamically compute accurate student counts for colleges and batches
  fColleges = fColleges.map((c) => {
    const byId = c.id ? filteredStudentCountByColId.get(c.id.toLowerCase()) || 0 : 0;
    const byName = c.name ? filteredStudentCountByColName.get(c.name.toLowerCase()) || 0 : 0;
    return { ...c, studentCount: Math.max(byId, byName) };
  });

  fBatches = fBatches.map((b) => ({
    ...b,
    studentCount: filteredStudentCountByBatchId.get(b.id) || 0,
  }));

  // Exclude external colleges from the main filteredColleges list used by the UI
  cache.filteredColleges = fColleges.filter(c => c.type !== "external");
  cache.filteredBatches = fBatches;
  cache.filteredStudents = fStudents;
  cache.filteredExams = fExams;
  cache.filteredResources = fResources;
  cache.filteredAttempts = fAttempts;

  // Include ALL colleges in hierarchy so computeExportedState can properly split them
  // Only rebuild hierarchy if the inputs actually changed (using lengths as a fast heuristic)
  const hKey = `${fColleges.length}-${fBatches.length}-${fStudents.length}`;
  if (!cache.hierarchy || (cache as any)._lastHierarchyKey !== hKey) {
    cache.hierarchy = buildHierarchy(fColleges, fBatches, fStudents);
    (cache as any)._lastHierarchyKey = hKey;
  }

  if (cache.colleges || cache.students || cache.exams || cache.resources || cache.batches || cache.attempts) {
    cache.loading = false;
  }
  persistCacheToStorage();
}

// ─── Debounced Recompute + Notify ────────────────────────────────────────────

// Implementation moved to top of file to avoid TDZ and duplicate declarations.

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

// ─── Subscription Engine (replaces getDocs polling) ─────────────────────────

let currentUserInfo: { uid: string; role: string; collegeId?: string; parsed: any } | null = null;

export async function refreshCache() {
  // Data is now kept perfectly in sync via native Firestore onSnapshot listeners.
  // Manual refreshes are no longer necessary and are mocked to prevent errors.
  return Promise.resolve();
}

async function startSubscriptions() {
  if (!currentUserInfo) return;
  const { role, collegeId, parsed } = currentUserInfo;
  const isMainAdmin = role === "main_admin" || role === "admin" || role === "superadmin" || role === "trainer";
  const isCollegeAdmin = role === "college_admin" && collegeId;
  const isStudent = role === "student" && parsed?.id;

  try {
    const { subscribeToDocuments, where } = await import("@/lib/firebase/firestore");
    
    stopPolling(); // Clear existing listeners before starting new ones

    console.time("[Firestore] Subscriptions setup");

    // 1. Colleges
    cache.unsubscribers.push(subscribeToDocuments<College>("colleges", (data) => {
      cache.colleges = { data, updatedAt: Date.now() };
      debouncedRecomputeAndNotify("colleges");
    }, [], false, { pageSize: 200 }));

    // 2. Batches
    const batchesConstraints = (isCollegeAdmin || isStudent) && collegeId ? [where("collegeId", "==", collegeId)] : [];
    cache.unsubscribers.push(subscribeToDocuments<Batch>("batches", (data) => {
      cache.batches = { data, updatedAt: Date.now() };
      debouncedRecomputeAndNotify("batches");
    }, batchesConstraints, false, { pageSize: 500 }));

    // 3. Students
    const studentsConstraints = isStudent && collegeId ? [where("collegeId", "==", collegeId)] 
      : isCollegeAdmin && collegeId ? [where("collegeId", "==", collegeId)] : [];
    cache.unsubscribers.push(subscribeToDocuments<Student>("students", (data) => {
      cache.students = { data, updatedAt: Date.now() };
      debouncedRecomputeAndNotify("students");
    }, studentsConstraints, false, { pageSize: isStudent ? 1000 : (isCollegeAdmin ? 2000 : 5000) }));

    // 4. Exams
    if ((isCollegeAdmin || isStudent) && collegeId) {
      let scopedExams: Exam[] = [];
      let globalExams: Exam[] = [];
      
      const updateExams = () => {
        const merged = [...scopedExams, ...globalExams];
        const unique = Array.from(new Map(merged.map(e => [e.id, e])).values());
        cache.exams = { data: unique, updatedAt: Date.now() };
        debouncedRecomputeAndNotify("exams");
      };

      cache.unsubscribers.push(subscribeToDocuments<Exam>("exams", (data) => {
        scopedExams = data; updateExams();
      }, [where("collegeId", "==", collegeId)], false, { pageSize: 500 }));

      cache.unsubscribers.push(subscribeToDocuments<Exam>("exams", (data) => {
        globalExams = data; updateExams();
      }, [where("collegeId", "in", ["global", "GLOBAL", "all", "ALL", ""])], false, { pageSize: 500 }));
    } else {
      cache.unsubscribers.push(subscribeToDocuments<Exam>("exams", (data) => {
        cache.exams = { data, updatedAt: Date.now() };
        debouncedRecomputeAndNotify("exams");
      }, [], false, { pageSize: 100 }));
    }

    // 5. Resources
    if ((isCollegeAdmin || isStudent) && collegeId) {
      let scopedRes: Resource[] = [];
      let globalRes: Resource[] = [];
      
      const updateRes = () => {
        const merged = [...scopedRes, ...globalRes];
        const unique = Array.from(new Map(merged.map(r => [r.id, r])).values());
        cache.resources = { data: unique, updatedAt: Date.now() };
        debouncedRecomputeAndNotify("resources");
      };

      cache.unsubscribers.push(subscribeToDocuments<Resource>("resources", (data) => {
        scopedRes = data; updateRes();
      }, [where("collegeId", "==", collegeId)], false, { pageSize: 500 }));

      cache.unsubscribers.push(subscribeToDocuments<Resource>("resources", (data) => {
        globalRes = data; updateRes();
      }, [where("collegeId", "in", ["global", "GLOBAL", "all", "ALL", ""])], false, { pageSize: 500 }));
    } else {
      cache.unsubscribers.push(subscribeToDocuments<Resource>("resources", (data) => {
        cache.resources = { data, updatedAt: Date.now() };
        debouncedRecomputeAndNotify("resources");
      }, [], false, { pageSize: 100 }));
    }

    // 6. Attempts
    const attemptsConstraints = (isStudent || isCollegeAdmin) && collegeId ? [where("collegeId", "==", collegeId)] : [];
    cache.unsubscribers.push(subscribeToDocuments<ExamAttempt>("exam_results", (data) => {
      cache.attempts = { data, updatedAt: Date.now() };
      debouncedRecomputeAndNotify("attempts");
    }, attemptsConstraints, false, { pageSize: (isStudent || isCollegeAdmin) ? 500 : 2000 }));

    console.timeEnd("[Firestore] Subscriptions setup");

  } catch (error) {
    console.error("Failed to fetch LMS Data", error);
  }
}

function recomputeAndNotify() {
  recomputeScopedData();
  notifyListeners();
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

        // Store user info for subscriptions
        currentUserInfo = { uid: user.uid, role, collegeId: parsed?.collegeId, parsed };

        // Start Subscriptions
        startSubscriptions();
      });
      
      // Do NOT push authUnsub to cache.unsubscribers, otherwise stopPolling() will kill the auth listener!
      // cache.authUnsub = authUnsub; // We can store it separately if needed.
    });
  });
}

function stopPolling() {
  cache.unsubscribers.forEach((unsub) => { try { unsub(); } catch(e) {} });
  cache.unsubscribers = [];
  if (typeof window !== "undefined") {
    (window as any).__lms_unsubs = [];
  }
}

// ─── Exported State Computation ──────────────────────────────────────────────

function computeExportedState() {
  const hierarchy = cache.hierarchy;
  const colleges = hierarchy?.colleges || [];
  const students = hierarchy?.students || [];

  // Colleges with type === "external" are real Firestore docs but represent outside institutions
  const officialFirestoreColleges = colleges.filter((c) => c.type !== "external");
  const externalFirestoreColleges = colleges.filter((c) => c.type === "external");

  // Also include the legacy dynamically computed external institutions
  const dynamicExternals = getExternalInstitutions(students, officialFirestoreColleges);

  // Pre-compute student counts for official and external colleges to avoid O(N*M) filtering
  const studentCountByColId = new Map<string, number>();
  const studentCountByColName = new Map<string, number>();
  
  students.forEach((s) => {
    if (s.collegeId) {
      const id = s.collegeId.toLowerCase();
      studentCountByColId.set(id, (studentCountByColId.get(id) || 0) + 1);
    }
    if (s.collegeName) {
      const name = s.collegeName.toLowerCase();
      studentCountByColName.set(name, (studentCountByColName.get(name) || 0) + 1);
    }
  });

  const getStudentCount = (c: College) => {
    const byId = c.id ? studentCountByColId.get(c.id.toLowerCase()) || 0 : 0;
    const byName = c.name ? studentCountByColName.get(c.name.toLowerCase()) || 0 : 0;
    return Math.max(byId, byName);
  };

  // Merge Firestore external colleges with dynamic external institutions, avoiding duplicates
  const externals: Institution[] = [
    ...externalFirestoreColleges.map((c) => ({
       id: c.id,
       name: safeDisplayName(c.name ? c.name.toLowerCase() : "", c.id, "Unknown Institution").toLowerCase(),
       type: "external" as const,
       code: c.code,
       departments: c.departments || [],
       isDeleted: c.isDeleted,
       studentCount: getStudentCount(c),
    })),
    ...dynamicExternals.filter(dyn => !externalFirestoreColleges.some(extC => 
         extC.id === dyn.id || extC.name.toLowerCase() === dyn.name.toLowerCase()
    ))
  ];

  const officialInstitutions: Institution[] = officialFirestoreColleges.map((c) => ({
    id: c.id,
    name: safeDisplayName(c.name ? c.name.toLowerCase() : "", c.id, "Unknown Institution").toLowerCase(),
    type: "official",
    code: c.code,
    departments: c.departments,
    isDeleted: c.isDeleted,
    studentCount: getStudentCount(c),
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
