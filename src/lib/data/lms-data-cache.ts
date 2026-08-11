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
import { isAssignedToStudent } from "@/lib/services/assignment-engine";

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
      // CRITICAL: Only persist if we actually have data. Never save empty arrays
      // because that poisons the cache and causes zero-data on next page load.
      const colleges = cache.colleges?.data || [];
      const batches = cache.batches?.data || [];
      const students = cache.students?.data || [];
      const exams = cache.exams?.data || [];
      const resources = cache.resources?.data || [];
      const attempts = cache.attempts?.data || [];
      
      const hasAnyData = colleges.length > 0 || students.length > 0 || exams.length > 0 || resources.length > 0;
      if (!hasAnyData) {
        console.warn("[CACHE] Skipping localStorage save — all collections empty (would poison cache)");
        return;
      }
      
      const payload = { colleges, batches, students, exams, resources, attempts };
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
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
      // CRITICAL: Set updatedAt to 0 (not Date.now()) so that the TTL check in
      // fetchLMSData always allows a fresh Firestore fetch on page load.
      // The hydrated data is shown as a fast placeholder while the real fetch runs.
      const STALE_TIMESTAMP = 0;
      if (Array.isArray(parsed.colleges) && parsed.colleges.length > 0) cache.colleges = { data: parsed.colleges.filter(isActive), updatedAt: STALE_TIMESTAMP };
      if (Array.isArray(parsed.batches) && parsed.batches.length > 0) cache.batches = { data: parsed.batches.filter(isActive), updatedAt: STALE_TIMESTAMP };
      if (Array.isArray(parsed.students) && parsed.students.length > 0) cache.students = { data: parsed.students.filter(isActive), updatedAt: STALE_TIMESTAMP };
      if (Array.isArray(parsed.exams) && parsed.exams.length > 0) cache.exams = { data: parsed.exams.filter(isActive), updatedAt: STALE_TIMESTAMP };
      if (Array.isArray(parsed.resources) && parsed.resources.length > 0) cache.resources = { data: parsed.resources.filter(isActive), updatedAt: STALE_TIMESTAMP };
      if (Array.isArray(parsed.attempts) && parsed.attempts.length > 0) cache.attempts = { data: parsed.attempts.filter(isActive), updatedAt: STALE_TIMESTAMP };

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

  const isCollegeDeleted = (colId?: any, colName?: any) => {
    if (colId && (String(colId).toLowerCase().trim() === "global" || String(colId).toLowerCase().trim() === "unassigned")) return false;
    if (colName && (String(colName).toLowerCase().trim() === "global" || String(colName).toLowerCase().trim() === "unassigned")) return false;
    
    if (colId && deletedCollegesSet.has(String(colId).toLowerCase().trim())) return true;
    if (colName && deletedCollegesSet.has(String(colName).toLowerCase().trim())) return true;
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
        const currentUserAsStudent = { ...parsed, id: parsed.id || parsed.uid || "" } as Student;
        const userCollegeId = parsed.collegeId;
        const userCollegeName = parsed.collegeName;
        
        // Filter exams for college admins and students
        fExams = fExams.filter((exam) => {
          if (r === "student") {
            return isAssignedToStudent(exam.targets, currentUserAsStudent, (exam as any).sharedWith);
          }
          
          // For college admin:
          const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
          const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
          
          if (isGlobal) return true;
          
          if (userCollegeId && tCol === userCollegeId) return true;
          if (userCollegeName && tCol.toLowerCase() === userCollegeName.toLowerCase()) return true;
          
          if (exam.targets && Array.isArray(exam.targets)) {
            if (exam.targets.some(t => 
              t.ids?.includes("global") || t.ids?.includes("GLOBAL") ||
              t.names?.includes("global") || t.names?.includes("GLOBAL") ||
              t.collegeId === "global" || t.collegeId === "GLOBAL" || t.collegeId === "all" || t.collegeId === "ALL"
            )) return true;
            
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
        
        // Filter resources for college admins and students
        fResources = fResources.filter((resource) => {
          if (r === "student") {
            return isAssignedToStudent(resource.targets, currentUserAsStudent, resource.sharedWith);
          }
          
          const tCol = resource.collegeId || resource.targets?.[0]?.collegeId;
          const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
          
          if (isGlobal) return true;
          
          if (userCollegeId && tCol === userCollegeId) return true;
          if (userCollegeName && tCol.toLowerCase() === userCollegeName.toLowerCase()) return true;
          
          if (resource.sharedWith && Array.isArray(resource.sharedWith)) {
            if (resource.sharedWith.includes("global") || 
                resource.sharedWith.includes("GLOBAL") ||
                resource.sharedWith.includes("all") ||
                resource.sharedWith.includes("*")) return true;
                
            if (userCollegeId && resource.sharedWith.includes(userCollegeId)) return true;
            if (userCollegeName && resource.sharedWith.some(s => s.toLowerCase() === userCollegeName.toLowerCase())) return true;
          }
          
          if (resource.targets && Array.isArray(resource.targets)) {
            if (resource.targets.some(t => 
              t.ids?.includes("global") || t.ids?.includes("GLOBAL") ||
              t.names?.includes("global") || t.names?.includes("GLOBAL") ||
              t.collegeId === "global" || t.collegeId === "GLOBAL" || t.collegeId === "all" || t.collegeId === "ALL"
            )) return true;
            
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
      const id = String(s.collegeId).toLowerCase();
      filteredStudentCountByColId.set(id, (filteredStudentCountByColId.get(id) || 0) + 1);
    }
    if (s.collegeName) {
      const name = String(s.collegeName).toLowerCase();
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
    const byId = c.id ? filteredStudentCountByColId.get(String(c.id).toLowerCase()) || 0 : 0;
    const byName = c.name ? filteredStudentCountByColName.get(String(c.name).toLowerCase()) || 0 : 0;
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
    startAuthListener();
  }
  cache.listeners++;

  return () => {
    callbacks.delete(callback);
    cache.listeners = Math.max(0, cache.listeners - 1);
    if (cache.listeners === 0) {
      cleanupTimer = setTimeout(() => {
        if (cache.listeners === 0) {
          stopAuthListener();
        }
      }, 5000);
    }
  };
}

// ─── Data Fetching Engine (TTL Caching) ───────────────────────────────────────

let currentUserInfo: { uid: string; role: string; collegeId?: string; parsed: any } | null = null;
let globalAuthUnsub: (() => void) | null = null;

export async function refreshCache() {
  return fetchLMSData(true);
}

async function fetchLMSData(force = false) {
  if (!currentUserInfo) return;
  const { role, collegeId, parsed } = currentUserInfo;
  
  // TTL Check: 5 minutes
  const TTL = 5 * 60 * 1000;
  const now = Date.now();
  if (!force && cache.colleges?.updatedAt && (now - cache.colleges.updatedAt < TTL)) {
    // Cache is fresh, skip Firestore reads
    if (cache.loading) {
      cache.loading = false;
      notifyListeners();
    }
    return;
  }

  cache.loading = true;
  cache.error = null;
  notifyListeners();

  const isMainAdmin = role === "main_admin" || role === "admin" || role === "superadmin" || role === "trainer";
  const isCollegeAdmin = role === "college_admin" && collegeId;
  const isStudent = role === "student" && parsed?.id;

  const { getDocuments, where } = await import("@/lib/firebase/firestore");
  console.time("[Firestore] Fetch LMS Data (getDocs)");
  
  const errors: string[] = [];

  // 1. Colleges — isolated
  try {
    const collegesRes = await getDocuments<College>("colleges", [], false, { pageSize: 100 });
    cache.colleges = { data: collegesRes.data, updatedAt: now };
  } catch (err: any) {
    console.error("[FETCH] Colleges failed:", err?.message || err);
    errors.push(`Colleges: ${err?.message || "Unknown error"}`);
  }

  // 2. Batches — isolated
  try {
    const batchesConstraints = (isCollegeAdmin || isStudent) && collegeId ? [where("collegeId", "==", collegeId)] : [];
    const batchesRes = await getDocuments<Batch>("batches", batchesConstraints, false, { pageSize: 100 });
    cache.batches = { data: batchesRes.data, updatedAt: now };
  } catch (err: any) {
    console.error("[FETCH] Batches failed:", err?.message || err);
    errors.push(`Batches: ${err?.message || "Unknown error"}`);
  }

  // 3. Students — isolated
  try {
    const studentsConstraints = (isStudent || isCollegeAdmin) && collegeId ? [where("collegeId", "==", collegeId)] : [];
    const studentsRes = await getDocuments<Student>("students", studentsConstraints, false, { pageSize: isStudent ? 200 : (isCollegeAdmin ? 500 : 500) });
    cache.students = { data: studentsRes.data, updatedAt: now };
  } catch (err: any) {
    console.error("[FETCH] Students failed:", err?.message || err);
    errors.push(`Students: ${err?.message || "Unknown error"}`);
  }

  // 4. Exams
  try {
    const examsRes = await getDocuments<Exam>("exams", [], false, { pageSize: 500 });
    cache.exams = { data: examsRes.data, updatedAt: now };
  } catch (err: any) {
    console.error("[FETCH] Exams failed:", err?.message || err);
    errors.push(`Exams: ${err?.message || "Unknown error"}`);
  }

  // 5. Resources
  try {
    const resourcesRes = await getDocuments<Resource>("resources", [], false, { pageSize: 500 });
    cache.resources = { data: resourcesRes.data, updatedAt: now };
  } catch (err: any) {
    console.error("[FETCH] Resources failed:", err?.message || err);
    errors.push(`Resources: ${err?.message || "Unknown error"}`);
  }

  // 6. Attempts — isolated
  try {
    const attemptsConstraints = (isStudent || isCollegeAdmin) && collegeId ? [where("collegeId", "==", collegeId)] : [];
    const attemptsRes = await getDocuments<ExamAttempt>("exam_results", attemptsConstraints, false, { pageSize: (isStudent || isCollegeAdmin) ? 100 : 200 });
    cache.attempts = { data: attemptsRes.data, updatedAt: now };
  } catch (err: any) {
    console.error("[FETCH] Attempts failed:", err?.message || err);
    errors.push(`Attempts: ${err?.message || "Unknown error"}`);
  }

  console.timeEnd("[Firestore] Fetch LMS Data (getDocs)");

  // Surface errors to UI only if ALL collections failed
  if (errors.length > 0) {
    console.warn(`[FETCH] ${errors.length} collection(s) had errors:`, errors);
    if (errors.length >= 6) {
      // Total failure — likely a permissions or network issue
      const firstError = errors[0];
      if (firstError.includes("Missing or insufficient permissions") || firstError.includes("permission-denied")) {
        cache.error = new Error("Access Denied: You do not have permission to read this data. Please log out and log back in.");
      } else if (firstError.includes("Quota exceeded") || firstError.includes("resource-exhausted")) {
        cache.error = new Error("Firebase Quota Exceeded. The daily read limit has been reached.");
      } else {
        cache.error = new Error(`Data sync partially failed: ${errors.join("; ")}`);
      }
    }
  }

  cache.loading = false;
  recomputeScopedData();
  notifyListeners();
}


function recomputeAndNotify() {
  recomputeScopedData();
  notifyListeners();
}

function startAuthListener() {
  if (globalAuthUnsub) return;

  if (!cache.colleges && !cache.students && !cache.exams && !cache.batches) {
    cache.loading = true;
  }
  cache.error = null;

  import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
    import("@/lib/firebase/config").then(({ app }) => {
      const auth = getAuth(app);
      
      globalAuthUnsub = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          // CRITICAL FIX: Do NOT set cache.loading = false or call notifyListeners() here.
          // On page refresh, onAuthStateChanged fires with null FIRST (while restoring session),
          // then fires again with the real user. If we push empty state to the UI here,
          // it causes a flash of "zero data" before the real data loads.
          currentUserInfo = null;
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
            
            // BACKFILL: Existing students might have an incomplete users doc that lacks college info
            if (role === "student" && (!parsed.collegeId || !parsed.collegeName)) {
              const studentDoc = await getDoc(doc(db, "students", user.uid));
              if (studentDoc.exists()) {
                parsed = { ...studentDoc.data(), ...parsed }; // users doc overrides, but students doc fills in missing fields
              }
            }
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

        // Derive collegeId if missing but collegeName is present (for self-registered external colleges)
        if (parsed && !parsed.collegeId && parsed.collegeName) {
          parsed.collegeId = parsed.collegeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
        }

        // AUTH READINESS GUARD: Prevent race condition where queries fire before collegeId resolves
        if (!isMainAdmin && !parsed?.collegeId) {
          return;
        }

        // Store user info for subscriptions
        currentUserInfo = { uid: user.uid, role, collegeId: parsed?.collegeId, parsed };

        // Fetch LMS Data directly instead of creating listeners
        fetchLMSData();
      });
    });
  });
}

function stopAuthListener() {
  if (globalAuthUnsub) {
    try { globalAuthUnsub(); } catch(e) {}
    globalAuthUnsub = null;
  }
  cache.unsubscribers = []; // Keep for backward compatibility if needed
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
      const id = String(s.collegeId).toLowerCase();
      studentCountByColId.set(id, (studentCountByColId.get(id) || 0) + 1);
    }
    if (s.collegeName) {
      const name = String(s.collegeName).toLowerCase();
      studentCountByColName.set(name, (studentCountByColName.get(name) || 0) + 1);
    }
  });

  const getStudentCount = (c: College) => {
    const byId = c.id ? studentCountByColId.get(String(c.id).toLowerCase()) || 0 : 0;
    const byName = c.name ? studentCountByColName.get(String(c.name).toLowerCase()) || 0 : 0;
    return Math.max(byId, byName);
  };

  // Merge Firestore external colleges with dynamic external institutions, avoiding duplicates
  const externals: Institution[] = [
    ...externalFirestoreColleges.map((c) => ({
       id: c.id,
       name: safeDisplayName(c.name ? String(c.name).toLowerCase() : "", c.id, "Unknown Institution").toLowerCase(),
       type: "external" as const,
       code: c.code,
       departments: c.departments || [],
       isDeleted: c.isDeleted,
       studentCount: getStudentCount(c),
    })),
    ...dynamicExternals.filter(dyn => !externalFirestoreColleges.some(extC => 
         extC.id === dyn.id || String(extC.name || "").toLowerCase() === String(dyn.name || "").toLowerCase()
    ))
  ];

  const officialInstitutions: Institution[] = officialFirestoreColleges.map((c) => ({
    id: c.id,
    name: safeDisplayName(c.name ? String(c.name).toLowerCase() : "", c.id, "Unknown Institution").toLowerCase(),
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
  stopAuthListener();
  cache.listeners = 0;
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
