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
import { supabase } from "@/lib/supabase/client";
import { getAuthProfileDataAction } from "@/lib/actions/auth-actions";
import { getStudentAttemptsAction } from "@/lib/actions/exam-actions";
import { fetchFullLMSStateAction } from "@/lib/actions/lms-sync-actions";
import { fetchLMSInitialStateAction, fetchRemainingStudentsAction } from "@/lib/actions/progressive-lms-actions";
import { getStudentCountWithFiltersAction, getStudentDashboardStatsAction } from "@/lib/actions/student-actions-optimized";
import {
  buildHierarchy,
  getExternalInstitutions,
  isStudentInCollege,
  getInstitutionName as resolveInstitutionName,
  safeDisplayName,
  markCollegeAsDeleted,
  deletedCollegesSet,
  cleanSlug,
  type Hierarchy,
  type Institution,
} from "@/lib/hierarchy/hierarchy-data";
import type { College, Batch, Student, SelectOption, Exam, Resource, ExamAttempt } from "@/types";
import { setLMSStoreState } from "./lms-store";
import { logger } from "@/lib/utils/logger";
import { isAssignedToStudent } from "@/lib/services/assignment-engine";
import { toMillis } from "@/lib/utils/date";

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
  rawBatches: Batch[];
  rawStudents: Student[];
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

const CACHE_STORAGE_KEY = "lms_data_cache_v5";
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
    // Clear old cache versions
    const oldVersions = ["lms_data_cache", "lms_data_cache_v2", "lms_data_cache_v3", "lms_data_cache_v4"];
    oldVersions.forEach(key => {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch (_) {}
    });

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
        computeExportedState();
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
  rawBatches: [],
  rawStudents: [],
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
  cache.rawBatches = batchesData;
  cache.rawStudents = studentsData;

  // Reconcile deletedCollegesSet: if a college exists in the live Firestore data,
  // it was re-created after being deleted. Remove it from the blacklist.
  // Uses slug-based fuzzy matching to handle format variations
  if (deletedCollegesSet.size > 0) {
    const slugify = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    
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

  const isActive = (d: { isDeleted?: boolean; deletedAt?: Date; status?: string }) => !d.isDeleted && !d.deletedAt && d.status !== "deleted";

  let fColleges = collegesData.filter((c) => isActive(c));
  let fBatches = batchesData.filter(isActive);
  let fStudents = studentsData.filter(isActive);
  const activeStudentIds = new Set(fStudents.map((s) => s.id));
  
  // Filter exams: Apply active check
  let fExams = examsData.filter((e) => isActive(e));
  
  let fResources = resourcesData.filter((r) => isActive(r as any));
  
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
        const matchedInDb = studentsData.find(
          (s) =>
            (parsed.id && s.id === parsed.id) ||
            (parsed.uid && s.id === parsed.uid) ||
            (parsed.email && s.email?.toLowerCase() === String(parsed.email).toLowerCase())
        );

        const currentUserAsStudent: Student = {
          ...parsed,
          ...(matchedInDb || {}),
          id: matchedInDb?.id || parsed.id || parsed.uid || "",
          email: matchedInDb?.email || parsed.email || "",
          collegeId: matchedInDb?.collegeId || parsed.collegeId || parsed.college || "",
          collegeName: matchedInDb?.collegeName || parsed.collegeName || parsed.college || "",
          batchIds: matchedInDb?.batchIds || parsed.batchIds || [],
          department: matchedInDb?.department || parsed.department || "",
          academicYear: matchedInDb?.academicYear || parsed.academicYear || "",
          section: matchedInDb?.section || parsed.section || "",
        } as Student;

        const userCollegeId = parsed.collegeId || matchedInDb?.collegeId;
        const userCollegeName = parsed.collegeName || matchedInDb?.collegeName;
        
        // Filter exams for college admins and students
        fExams = fExams.filter((exam) => {
          if (r === "student") {
            return isAssignedToStudent(exam.targets, currentUserAsStudent, (exam as any).sharedWith);
          }
          
          // For college admin:
          const tCol = (exam as any).collegeId || exam.targets?.[0]?.collegeId;
          const tColName = (exam as any).collegeName || exam.targets?.[0]?.collegeName;
          const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
          
          if (isGlobal) return true;
          
          if (userCollegeId && tCol === userCollegeId) return true;
          if (userCollegeName && String(tCol).toLowerCase() === String(userCollegeName).toLowerCase()) return true;
          if (userCollegeName && tColName && String(tColName).toLowerCase() === String(userCollegeName).toLowerCase()) return true;
          
          if (exam.targets && Array.isArray(exam.targets)) {
            if (exam.targets.some(t => 
              t.ids?.includes("global") || t.ids?.includes("GLOBAL") ||
              t.names?.includes("global") || t.names?.includes("GLOBAL") ||
              t.collegeId === "global" || t.collegeId === "GLOBAL" || t.collegeId === "all" || t.collegeId === "ALL"
            )) return true;
            
            if (exam.targets.some(t => {
              if (userCollegeId && t.collegeId === userCollegeId) return true;
              if (userCollegeName && String(t.collegeId || "").toLowerCase() === String(userCollegeName).toLowerCase()) return true;
              if (userCollegeName && String(t.collegeName || "").toLowerCase() === String(userCollegeName).toLowerCase()) return true;
              if (userCollegeId && t.ids?.includes(userCollegeId)) return true;
              if (userCollegeName && t.ids?.some(id => String(id).toLowerCase() === String(userCollegeName).toLowerCase())) return true;
              if (userCollegeName && t.names?.some(n => String(n).toLowerCase() === String(userCollegeName).toLowerCase())) return true;
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
          const tColName = resource.collegeName || resource.targets?.[0]?.collegeName;
          const isGlobal = !tCol || tCol === "global" || tCol === "GLOBAL" || tCol === "all" || tCol === "ALL";
          
          if (isGlobal) return true;
          
          if (userCollegeId && tCol === userCollegeId) return true;
          if (userCollegeName && String(tCol).toLowerCase() === String(userCollegeName).toLowerCase()) return true;
          if (userCollegeName && tColName && String(tColName).toLowerCase() === String(userCollegeName).toLowerCase()) return true;
          
          if (resource.sharedWith && Array.isArray(resource.sharedWith)) {
            if (resource.sharedWith.includes("global") || 
                resource.sharedWith.includes("GLOBAL") ||
                resource.sharedWith.includes("all") ||
                resource.sharedWith.includes("*")) return true;
                
            if (userCollegeId && resource.sharedWith.includes(userCollegeId)) return true;
            if (userCollegeName && resource.sharedWith.some(s => String(s).toLowerCase() === String(userCollegeName).toLowerCase())) return true;
          }
          
          if (resource.targets && Array.isArray(resource.targets)) {
            if (resource.targets.some(t => 
              t.ids?.includes("global") || t.ids?.includes("GLOBAL") ||
              t.names?.includes("global") || t.names?.includes("GLOBAL") ||
              t.collegeId === "global" || t.collegeId === "GLOBAL" || t.collegeId === "all" || t.collegeId === "ALL"
            )) return true;
            
            if (resource.targets.some(t => {
              if (userCollegeId && t.collegeId === userCollegeId) return true;
              if (userCollegeName && String(t.collegeId || "").toLowerCase() === String(userCollegeName).toLowerCase()) return true;
              if (userCollegeName && String(t.collegeName || "").toLowerCase() === String(userCollegeName).toLowerCase()) return true;
              if (userCollegeId && t.ids?.includes(userCollegeId)) return true;
              if (userCollegeName && t.ids?.some(id => String(id).toLowerCase() === String(userCollegeName).toLowerCase())) return true;
              if (userCollegeName && t.names?.some(n => String(n).toLowerCase() === String(userCollegeName).toLowerCase())) return true;
              return false;
            })) return true;
          }
          
          return false;
        });
      }
      if ((r === "college_admin" || r === "college") && (parsed.collegeId || parsed.collegeName)) {
        const dummyCol = { id: parsed.collegeId, name: parsed.collegeName || parsed.collegeId } as College;
        fStudents = fStudents.filter(s => isStudentInCollege(s, dummyCol));
      }
    }
  } catch (_) {}

  const colMap = new Map<string, string>();
  fColleges.forEach(c => {
    if (c.id && c.name) colMap.set(String(c.id).toLowerCase(), c.name);
    if (c.name) colMap.set(String(c.name).toLowerCase(), c.name);
  });

  fStudents = fStudents.map(s => {
    let colName = s.collegeName;
    if (!colName || colName === "Unknown Institution" || colName === "unknown") {
      if (s.collegeId && colMap.has(String(s.collegeId).toLowerCase())) {
        colName = colMap.get(String(s.collegeId).toLowerCase())!;
      } else if (!s.collegeId || s.collegeId === "col-unassigned" || s.collegeId === "unassigned") {
        colName = "Unassigned";
      } else {
        colName = s.collegeId;
      }
    }
    return { ...s, collegeName: colName };
  });

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

  // CRITICAL FIX: The above client-side counting is ONLY for the loaded chunk (100 students).
  // This creates the "8 students shown when college has 1,200" bug.
  // We will fetch TRUE counts from getDatabaseMetricsAction() on the Colleges page instead.
  // The counts computed here are just for the filtered/visible students in the current view.

  // Dynamically compute student counts ONLY from the loaded chunk (not the source of truth)
  fColleges = fColleges.map((c) => {
    const byId = c.id ? filteredStudentCountByColId.get(String(c.id).toLowerCase()) || 0 : 0;
    const byName = c.name ? filteredStudentCountByColName.get(String(c.name).toLowerCase()) || 0 : 0;
    // Use existing studentCount from database if available, fallback to chunk count
    return { ...c, studentCount: c.studentCount || Math.max(byId, byName) };
  });

  fBatches = fBatches.map((b) => ({
    ...b,
    studentCount: filteredStudentCountByBatchId.get(b.id) || (b.name ? filteredStudentCountByBatchId.get(b.name) : 0) || b.studentCount || 0,
  }));

  // Helper to ensure latest created items are shown at the start
  const sortByLatest = <T extends { createdAt?: any }>(arr: T[]): T[] => {
    return [...arr].sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));
  };

  // Exclude external colleges from the main filteredColleges list used by the UI
  cache.filteredColleges = sortByLatest(fColleges.filter(c => c.type !== "external"));
  cache.filteredBatches = sortByLatest(fBatches);
  cache.filteredStudents = sortByLatest(fStudents);
  cache.filteredExams = sortByLatest(fExams);
  cache.filteredResources = sortByLatest(fResources);
  cache.filteredAttempts = sortByLatest(fAttempts);

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
    startRealtimeSubscription();
  }
  cache.listeners++;

  return () => {
    callbacks.delete(callback);
    cache.listeners = Math.max(0, cache.listeners - 1);
    if (cache.listeners === 0) {
      cleanupTimer = setTimeout(() => {
        if (cache.listeners === 0) {
          stopAuthListener();
          stopRealtimeSubscription();
        }
      }, 5000);
    }
  };
}

// ─── Realtime Database Sync ──────────────────────────────────────────────────

let realtimeChannel: any = null;

function startRealtimeSubscription() {
  if (typeof window === "undefined" || realtimeChannel) {
    if (realtimeChannel) {
      console.log("[REALTIME] Channel already exists, skipping duplicate subscription");
    }
    return;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const triggerFastRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchLMSData(true).catch(() => {});
    }, 2000); // 2-second debounce prevents rapid-fire queries
  };

  try {
    realtimeChannel = supabase
      .channel("lms-realtime-data-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, triggerFastRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "colleges" }, triggerFastRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "batches" }, triggerFastRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "exams" }, triggerFastRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "resources" }, triggerFastRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts" }, triggerFastRefresh)
      .subscribe();
    
    console.log("[REALTIME] Subscribed to postgres changes successfully");
  } catch (err) {
    console.warn("[REALTIME] Failed to subscribe to postgres changes:", err);
  }
}

function stopRealtimeSubscription() {
  if (realtimeChannel) {
    try {
      supabase.removeChannel(realtimeChannel);
    } catch (_) {}
    realtimeChannel = null;
  }
}

// ─── Data Fetching Engine (Unified Aggregate Single-Round-Trip) ──────────────

function mapStudentRow(row: any): Student {
  if (!row) return row;
  const user = row.users || {};
  const batchIds: string[] = [];
  const batchNames: string[] = [];
  const batchesList: Array<{ id: string; name: string; department?: string; section?: string }> = [];

  if (Array.isArray(row.student_batches)) {
    row.student_batches.forEach((sb: any) => {
      const bId = sb.batchId || sb.batches?.id;
      const bName = sb.batches?.name;
      if (bId && !batchIds.includes(bId)) {
        batchIds.push(bId);
      }
      if (bName && !batchNames.includes(bName)) {
        batchNames.push(bName);
      }
      if (sb.batches) {
        batchesList.push({
          id: sb.batches.id,
          name: sb.batches.name,
          department: sb.batches.department,
          section: sb.batches.section,
        });
      }
    });
  } else if (Array.isArray(row.batchIds)) {
    row.batchIds.forEach((b: string) => {
      if (b && !batchIds.includes(b)) batchIds.push(b);
    });
  }

  const collegeName =
    row.colleges?.name ||
    row.collegeName ||
    (!row.collegeId || row.collegeId === "col-unassigned" || row.collegeId === "unassigned"
      ? "Unassigned"
      : row.collegeId);

  const mapped = {
    ...row,
    collegeName,
    name: user.displayName || user.name || row.name || "Unnamed Student",
    email: user.email || row.email || "",
    role: user.role || row.role || "student",
    displayName: user.displayName || user.name || row.displayName || "Unnamed Student",
    // CRITICAL: Always use users.status as the source of truth. Never fall back to students.status
    // because students table has a separate status column that may be out of sync.
    status: user.status || "active",
    batchIds,
    batchNames,
    batches: batchesList,
    batchCount: batchIds.length,
  };
  delete mapped.users;
  delete mapped.colleges;
  return mapped as Student;
}

function mapBatchRow(row: any): Batch {
  if (!row) return row;
  const studentIds = Array.isArray(row.student_batches)
    ? row.student_batches.map((sb: any) => sb.studentId)
    : row.studentIds || [];
  const studentCount =
    row._count?.student_batches ?? row.student_batches?.length ?? row.studentCount ?? studentIds.length ?? 0;
  return {
    ...row,
    studentCount,
    studentIds,
  } as Batch;
}

let currentUserInfo: { uid: string; role: string; collegeId?: string; parsed: any } | null = null;
let globalAuthUnsub: (() => void) | null = null;
let activeFetchPromise: Promise<void> | null = null;
let pendingForceRefresh = false;

/**
 * Progressively load remaining students in background without blocking UI
 * DISABLED - Using optimized pagination instead
 */
async function loadRemainingStudentsInBackground(currentSkip: number, total: number) {
  console.log("[CACHE] Background loading DISABLED - use optimized students page with pagination");
  // Disabled to prevent automatic loading of ALL students
  return Promise.resolve();
}

export async function refreshCache(): Promise<void> {
  return fetchLMSData(true);
}

/**
 * Core fetch deduplication gate. Ensures AT MOST ONE in-flight fetch at any time.
 * If a fetch is already running, ALL subsequent calls (including force=true) will
 * piggyback on the existing promise instead of spawning a competing parallel fetch.
 * If force=true while a fetch is in-flight, a follow-up fetch is queued automatically.
 */
async function fetchLMSData(force = false): Promise<void> {
  if (activeFetchPromise) {
    // If this is a forced refresh request while a fetch is already running,
    // flag it so that a follow-up fetch runs after the current one completes.
    if (force) pendingForceRefresh = true;
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    try {
      await performFetchLMSData(force);
    } finally {
      activeFetchPromise = null;
      // If a force refresh was requested while the previous fetch was running,
      // run one more fetch cycle to pick up the latest data.
      if (pendingForceRefresh) {
        pendingForceRefresh = false;
        // Use setTimeout(0) to avoid deep recursion / stack overflow
        setTimeout(() => { fetchLMSData(true).catch(() => {}); }, 0);
      }
    }
  })();

  return activeFetchPromise;
}

async function performFetchLMSData(force = false): Promise<void> {
  console.log("[CACHE] performFetchLMSData called - force:", force);
  
  // TTL Check: 60 seconds for cached data, or instant if forced
  const TTL = 60 * 1000;
  const now = Date.now();
  const cacheAge = cache.colleges?.updatedAt ? now - cache.colleges.updatedAt : Infinity;
  console.log("[CACHE] Cache age:", cacheAge, "ms, TTL:", TTL, "ms");
  
  if (!force && cache.colleges?.updatedAt && cacheAge < TTL) {
    console.log("[CACHE] Data is fresh (TTL check), skipping fetch");
    if (cache.loading) {
      cache.loading = false;
      notifyListeners();
    }
    return;
  }

  const hasExistingData = Boolean(
    (cache.colleges?.data && cache.colleges.data.length > 0) ||
    (cache.students?.data && cache.students.data.length > 0) ||
    (cache.exams?.data && cache.exams.data.length > 0) ||
    (cache.batches?.data && cache.batches.data.length > 0)
  );

  console.log("[CACHE] hasExistingData:", hasExistingData);

  // Only display initial loading spinner if we have zero cached data.
  if (!hasExistingData) {
    cache.loading = true;
    cache.error = null;
    notifyListeners();
  }

  // Safety timeout: if the fetch takes longer than 20 seconds, force loading=false
  // so the UI doesn't get stuck in an infinite loading state.
  const safetyTimer = setTimeout(() => {
    if (cache.loading) {
      console.warn("[CACHE] Safety timeout: force-clearing loading state after 20s");
      cache.loading = false;
      recomputeScopedData();
      notifyListeners();
    }
  }, 20000);

  try {
    // Use fast initial load (only 100 students) - remaining students load in background
    console.log("[CACHE] Calling fetchLMSInitialStateAction()...");
    const res = await fetchLMSInitialStateAction();
    console.log("[CACHE] fetchLMSInitialStateAction result:", { success: res.success, hasData: !!res.data });
    
    if (res.success && res.data) {
      const { colleges, batches, students, exams, resources, attempts, metadata } = res.data;
      console.log("[CACHE] Received data counts:", {
        colleges: colleges?.length || 0,
        batches: batches?.length || 0,
        students: students?.length || 0,
        exams: exams?.length || 0,
        resources: resources?.length || 0,
        attempts: attempts?.length || 0,
      });
      
      const parsedColleges = JSON.parse(JSON.stringify(colleges || [])) as College[];
      const parsedBatches = (JSON.parse(JSON.stringify(batches || [])) as any[]).map(mapBatchRow);
      const parsedStudents = (JSON.parse(JSON.stringify(students || [])) as any[]).map(mapStudentRow);
      const parsedExams = JSON.parse(JSON.stringify(exams || [])) as Exam[];
      const parsedResources = JSON.parse(JSON.stringify(resources || [])) as Resource[];
      const parsedAttempts = JSON.parse(JSON.stringify(attempts || [])) as ExamAttempt[];

      cache.colleges = { data: parsedColleges, updatedAt: now };
      cache.batches = { data: parsedBatches, updatedAt: now };
      cache.students = { data: parsedStudents, updatedAt: now };
      cache.exams = { data: parsedExams, updatedAt: now };
      cache.resources = { data: parsedResources, updatedAt: now };
      cache.attempts = { data: parsedAttempts, updatedAt: now };
      cache.error = null;
      
      console.log("[CACHE] Cache populated successfully");
    } else {
      // Fetch returned success=false but we have stale cache — don't leave loading=true
      console.warn("[CACHE] Fetch returned no data, keeping stale cache", res);
    }
  } catch (err: any) {
    console.error("[FETCH] Unified LMS sync failed:", err);
  }

  clearTimeout(safetyTimer);
  cache.loading = false;
  recomputeScopedData();
  notifyListeners();
}

function recomputeAndNotify() {
  recomputeScopedData();
  notifyListeners();
}

function startAuthListener() {
  // CRITICAL FIX: Always trigger ONE initial fetch if we haven't fetched from network yet
  // The hasAnyData check was preventing fetches when localStorage had stale data
  const hasRecentData = cache.colleges?.updatedAt && cache.colleges.updatedAt > 0 && (Date.now() - cache.colleges.updatedAt) < 60000;
  
  console.log("[CACHE] startAuthListener - hasRecentData:", hasRecentData, "globalAuthUnsub:", !!globalAuthUnsub);
  
  if (!hasRecentData && !globalAuthUnsub) {
    // Trigger initial load if we don't have fresh network data yet
    console.log("[CACHE] Triggering initial fetchLMSData() - stale or missing data");
    fetchLMSData(false);
  }

  if (globalAuthUnsub) return;

  cache.error = null;

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    if (!user) return;

    let parsed: any = null;
    let role: string = "";

    try {
      const { profile: userDoc, studentDoc } = await getAuthProfileDataAction(user.id);
      
      if (userDoc) {
        parsed = { ...userDoc } as any;
        role = parsed.role?.toLowerCase() || "admin";
        
        if (role === "student" && (!parsed.collegeId || !parsed.collegeName)) {
          if (studentDoc) {
            parsed = { ...studentDoc, ...parsed };
          }
        }
      } else {
        if (studentDoc) {
          parsed = studentDoc ? (Object.assign({}, studentDoc) as any) : {};
          role = "student";
        }
      }

      if (parsed) {
        if (typeof window !== "undefined") {
          localStorage.setItem("lms_user", JSON.stringify(parsed));
          localStorage.setItem("user", JSON.stringify(parsed));
          localStorage.setItem("lms_role", role);
          
          const isSecure = window.location.protocol === "https:";
          const cookieOptions = `path=/; max-age=2592000; SameSite=Lax${isSecure ? "; Secure" : ""}`;
          document.cookie = `lms_auth=true; ${cookieOptions}`;
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

    if (parsed && !parsed.collegeId && parsed.collegeName) {
      parsed.collegeId = parsed.collegeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
    }

    currentUserInfo = { uid: user.id, role, collegeId: parsed?.collegeId, parsed };
    // Recompute filtered data based on new auth state, but DON'T fetch from network
    // The initial fetch already happened in startAuthListener() when cache was empty
    recomputeScopedData();
    notifyListeners();
  });
  
  globalAuthUnsub = () => subscription.unsubscribe();
}

function stopAuthListener() {
  if (globalAuthUnsub) {
    try { globalAuthUnsub(); } catch(e) {}
    globalAuthUnsub = null;
  }
  cache.unsubscribers = [];
}

// ─── Exported State Computation ──────────────────────────────────────────────

function computeExportedState() {
  const hierarchy = cache.hierarchy;
  const colleges = hierarchy?.colleges || [];
  const students = hierarchy?.students || [];

  const officialFirestoreColleges = colleges.filter((c) => c.type !== "external");
  const externalFirestoreColleges = colleges.filter((c) => c.type === "external");
  const dynamicExternals = getExternalInstitutions(students, officialFirestoreColleges);

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

  const officialNames = new Set(officialFirestoreColleges.map((c) => String(c.name || "").toLowerCase()));
  const officialSlugs = new Set(officialFirestoreColleges.map((c) => cleanSlug(c.name)));
  const dedupedExternalFirestore = externalFirestoreColleges.filter((c) => {
    const name = String(c.name || "").toLowerCase();
    const slug = cleanSlug(c.name);
    return !officialNames.has(name) && !officialSlugs.has(slug);
  });

  const externals: Institution[] = [
    ...dedupedExternalFirestore.map((c) => ({
       id: c.id,
       name: safeDisplayName(c.name ? String(c.name).toLowerCase() : "", c.id, "Unknown Institution").toLowerCase(),
       type: "external" as const,
       code: c.code,
       departments: c.departments || [],
       isDeleted: c.isDeleted,
       studentCount: getStudentCount(c),
    })),
    ...dynamicExternals.filter(dyn => {
      const dynName = String(dyn.name || "").toLowerCase();
      const dynSlug = cleanSlug(dyn.name);
      if (officialNames.has(dynName) || officialSlugs.has(dynSlug)) return false;
      if (dedupedExternalFirestore.some(extC => 
           extC.id === dyn.id || String(extC.name || "").toLowerCase() === dynName
      )) return false;
      return true;
    })
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

  const uniqueInstitutionsMap = new Map<string, Institution>();
  
  [...officialInstitutions, ...externals].forEach(inst => {
    const slug = cleanSlug(inst.name);
    if (!uniqueInstitutionsMap.has(slug) || inst.type === "official") {
      uniqueInstitutionsMap.set(slug, inst);
    }
  });

  const institutions: Institution[] = Array.from(uniqueInstitutionsMap.values());

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
    lastRefreshTimestamp: Date.now(),
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

export function optimisticAddCollegeToCache(college: College): void {
  if (!cache.colleges) cache.colleges = { data: [], updatedAt: Date.now() };
  cache.colleges.data = [college, ...cache.colleges.data.filter((c) => c.id !== college.id)];
  recomputeScopedData();
  notifyListeners();
}

export function optimisticUpdateCollegeInCache(collegeId: string, updates: Partial<College>): void {
  if (cache.colleges?.data) {
    cache.colleges.data = cache.colleges.data.map((c) => (c.id === collegeId ? { ...c, ...updates } : c));
    recomputeScopedData();
    notifyListeners();
  }
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

export function optimisticAddStudentToCache(student: Student): void {
  if (!cache.students) cache.students = { data: [], updatedAt: Date.now() };
  cache.students.data = [student, ...cache.students.data.filter((s) => s.id !== student.id)];
  recomputeScopedData();
  notifyListeners();
}

export function optimisticUpdateStudentInCache(studentId: string, updates: Partial<Student>): void {
  if (cache.students?.data) {
    cache.students.data = cache.students.data.map((s) => (s.id === studentId ? { ...s, ...updates } : s));
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticDeleteStudentFromCache(studentId: string): void {
  if (cache.students?.data) {
    cache.students.data = cache.students.data.filter((s) => s.id !== studentId);
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticAddExamToCache(exam: Exam): void {
  if (!cache.exams) cache.exams = { data: [], updatedAt: Date.now() };
  cache.exams.data = [exam, ...cache.exams.data.filter((e) => e.id !== exam.id)];
  recomputeScopedData();
  notifyListeners();
}

export function optimisticUpdateExamInCache(examId: string, updates: Partial<Exam>): void {
  if (cache.exams?.data) {
    cache.exams.data = cache.exams.data.map((e) => (e.id === examId ? { ...e, ...updates } : e));
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticDeleteExamFromCache(examId: string): void {
  if (cache.exams?.data) {
    cache.exams.data = cache.exams.data.filter((e) => e.id !== examId);
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticAddBatchToCache(batch: Batch): void {
  if (!cache.batches) cache.batches = { data: [], updatedAt: Date.now() };
  cache.batches.data = [batch, ...cache.batches.data.filter((b) => b.id !== batch.id)];
  recomputeScopedData();
  notifyListeners();
}

export function optimisticUpdateBatchInCache(batchId: string, updates: Partial<Batch>): void {
  if (cache.batches?.data) {
    cache.batches.data = cache.batches.data.map((b) => (b.id === batchId ? { ...b, ...updates } : b));
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticDeleteBatchFromCache(batchId: string): void {
  if (cache.batches?.data) {
    cache.batches.data = cache.batches.data.filter((b) => b.id !== batchId);
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticAddResourceToCache(resource: Resource): void {
  if (!cache.resources) cache.resources = { data: [], updatedAt: Date.now() };
  cache.resources.data = [resource, ...cache.resources.data.filter((r) => r.id !== resource.id)];
  recomputeScopedData();
  notifyListeners();
}

export function optimisticUpdateResourceInCache(resourceId: string, updates: Partial<Resource>): void {
  if (cache.resources?.data) {
    cache.resources.data = cache.resources.data.map((r) => (r.id === resourceId ? { ...r, ...updates } : r));
    recomputeScopedData();
    notifyListeners();
  }
}

export function optimisticDeleteResourceFromCache(resourceId: string): void {
  if (cache.resources?.data) {
    cache.resources.data = cache.resources.data.filter((r) => r.id !== resourceId);
    recomputeScopedData();
    notifyListeners();
  }
}

export function invalidateLMSCache(): void {
  stopAuthListener();
  stopRealtimeSubscription();
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
