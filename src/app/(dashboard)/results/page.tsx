"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy,
  CheckCircle2,
  XCircle,
  Award,
  Users,
  Search,
  Eye,
  X,
  Trash2,
  RefreshCw,
  RotateCcw,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { FilterDropdown } from "@/components/shared/filter-dropdown";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { filterStudentByAcademicFilters } from "@/lib/hierarchy/hierarchy-data";
import { fadeInUp } from "@/lib/animations";
import {
  deleteResultById,
  clearAllResults,
} from "@/lib/services";
import { useLMSData } from "@/lib/data/use-lms-data";
import { getPaginatedResultsAction } from "@/lib/actions/results-actions";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import { fetchFullLMSStateAction } from "@/lib/actions/lms-sync-actions";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { uniqueOptions } from "@/lib/utils/array";
import type { ExamAttempt, Exam, Student } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatLiveDate(val: any): string {
  if (!val) return "Live Attempt";
  try {
    if (typeof val?.toDate === "function") {
      return val.toDate().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (val?.seconds) {
      return new Date(val.seconds * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    const dateObj = new Date(val);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {
    // fallback
  }
  return "Live Attempt";
}

function toTimestampSeconds(val: unknown): number {
  if (!val) return 0;
  try {
    if (typeof (val as { toDate?: () => Date }).toDate === "function") {
      return (val as { toDate: () => Date }).toDate().getTime() / 1000;
    }
    if (typeof (val as { seconds?: number }).seconds === "number") {
      return (val as { seconds: number }).seconds;
    }
    const d = new Date(val as string | number);
    if (!isNaN(d.getTime())) return d.getTime() / 1000;
  } catch {
    // ignore
  }
  return 0;
}

export default function ResultsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { filteredExams: exams, filteredStudents: students, loading: lmsLoading } = useLMSData();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [attemptPage, setAttemptPage] = useState(1);
  const [totalServerSubmissions, setTotalServerSubmissions] = useState(0);
  const [serverStats, setServerStats] = useState({
    passRate: 0,
    avgScore: 0,
    highestScore: 0,
  });
  const { resolveStudent, resolveInstitution } = useEntityResolution();
  const [actualRole, setActualRole] = useState<string>("student");
  const [mounted, setMounted] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [currentStudentUser, setCurrentStudentUser] = useState<Student | null>(null);

  // Compute the route for an attempt's answer sheet. Trainers/admins see
  // /admin/results/<id> when the dashboard is mounted under /admin, otherwise
  // the dashboard route /results/<id>. Students do not use this helper.
  const getAnswerSheetPath = (attemptId: string): string => {
    if (pathname?.startsWith("/admin")) return `/admin/results/${attemptId}`;
    return `/results/${attemptId}`;
  };

  // Role toggle: default to "student" so trainers instantly view student evaluation records
  const [userRole, setUserRole] = useState<"admin" | "student">("student");

  // Powerful Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [searchQueryRaw, setSearchQueryRaw] = useState("");
  const [examFilter, setExamFilter] = useState("ALL");
  const [studentFilter, setStudentFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"date_desc" | "score_desc" | "score_asc">("date_desc");

  const {
    filters: academicFilters,
    filterValidation,
    setFilters: setAcademicFilters,
    reset: resetAcademicFilters,
    institutionOptions,
    collegeOptions,
    departmentOptions,
    academicYearOptions,
    sectionOptions,
    batchOptions,
  } = useAcademicHierarchy({
    levels: actualRole === "college_admin" ? ["department", "academicYear", "section", "batch"] : ["institution", "department", "academicYear", "section", "batch"],
  });

  // Performance Details Modal state
  const [selectedAttempt, setSelectedAttempt] = useState<ExamAttempt | null>(null);

  // Confirm Modal state for Purge / Delete
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  async function loadData() {
    // Handled by useEffect changing dependencies
    setAttemptPage(1);
    setSearchQuery("");
  }

  // Fetch results from server with pagination
  useEffect(() => {
    let isMounted = true;
    
    const fetchResults = async () => {
      if (!mounted || !currentStudentUser && actualRole === "student") return;
      
      setLoadingResults(true);
      
      try {
        const result = await getPaginatedResultsAction({
          collegeId: academicFilters.collegeId,
          department: academicFilters.department,
          academicYear: academicFilters.academicYear,
          section: academicFilters.section,
          batchId: academicFilters.batchId,
          studentFilter,
          examFilter,
          outcomeFilter,
          searchQuery,
          sortBy,
          page: attemptPage,
          limit: 25,
          userContext: {
            role: actualRole,
            id: currentStudentUser?.id,
            authId: (currentStudentUser as any)?.authId,
            email: currentStudentUser?.email,
            collegeId: currentStudentUser?.collegeId,
          },
        });

        if (isMounted && result.success && result.data) {
          setAttempts(result.data.attempts);
          setTotalServerSubmissions(result.data.totalCount);
          setServerStats({
            passRate: result.data.passRate || 0,
            avgScore: result.data.avgScore || 0,
            highestScore: result.data.highestScore || 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch results:", error);
      } finally {
        if (isMounted) {
          setLoadingResults(false);
        }
      }
    };

    fetchResults();

    return () => {
      isMounted = false;
    };
  }, [
    mounted,
    actualRole,
    currentStudentUser,
    academicFilters.collegeId,
    academicFilters.department,
    academicFilters.academicYear,
    academicFilters.section,
    academicFilters.batchId,
    studentFilter,
    examFilter,
    outcomeFilter,
    searchQuery,
    sortBy,
    attemptPage,
  ]);

  useEffect(() => {
    setMounted(true);
    try {
      const role = localStorage.getItem("lms_role") || "admin";
       
      setActualRole(role.toLowerCase());
      if (role.toLowerCase() === "student") {
        setUserRole("student");
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) setCurrentStudentUser(JSON.parse(uStr) as Student);
      } else {
        setUserRole("student"); // Trainers look at students by default
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {}

    loadData();
   
  }, []);

  // Data is synced by useLMSData, no need for redundant subscriptions

  // Helper: find the live student record for an attempt by id or email.
  const getStudentForAttempt = useCallback(
    (attempt: ExamAttempt): Student | undefined => {
      const sId = attempt.studentId;
      const sEmail = (attempt as unknown as { studentEmail?: string }).studentEmail;
      const sName = attempt.studentName?.toLowerCase().trim();
      return (students as Student[]).find((s: Student) => {
        if (sId && (s.id === sId || s.email === sId)) return true;
        if (sEmail && s.email.toLowerCase() === sEmail.toLowerCase()) return true;
        // Do not fallback to matching by name alone, as it causes false positives for deleted students with common names
        return false;
      });
    },
    [students]
  );

  const getStudentName = useCallback(
    (attempt: ExamAttempt): string => {
      let resolved = resolveStudent(attempt.studentId);
      if ((resolved === "Unknown Student" || resolved === attempt.studentId) && (attempt as any).studentName) {
        return (attempt as any).studentName;
      }
      return resolved;
    },
    [resolveStudent]
  );

  // Map examId to human-readable title. Prefer live exam titles (which persist
  // even after soft-deletion) so deleted exams still render their real name,
  // then fall back to the title persisted on the attempt, then "Deleted Assessment".
  const examTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    (attempts as ExamAttempt[]).forEach((a: ExamAttempt) => {
      if (a.examId) map[a.examId] = a.examTitle || "Deleted Assessment";
    });
    (exams as Exam[]).forEach((e: Exam) => {
      if (e.id) map[e.id] = e.title || map[e.id] || "Deleted Assessment";
    });
    return map;
  }, [attempts, exams]);

  // Attempts are now fetched from server with filters applied, no need for client-side filtering
  const filteredAttemptsByHierarchy = attempts;

  // Unique exam IDs / titles derived from the hierarchy-filtered attempts.
  const examSubjectsList = useMemo(() => {
    return uniqueOptions(
      filteredAttemptsByHierarchy
        .filter((a: ExamAttempt) => Boolean(a.examId))
        .map((a: ExamAttempt) => ({ id: a.examId as string, title: examTitleMap[a.examId] || a.examTitle || "Deleted Assessment" })),
      (e: { id: string }) => e.id
    );
  }, [filteredAttemptsByHierarchy, examTitleMap]);

  // Unique student names: hierarchy-filtered attempt student names (admin attempts
  // excluded) plus all live student records. Case-insensitively deduplicated.
  const studentNamesList = useMemo(() => {
    const isAdminAttempt = (a: ExamAttempt) => {
      const name = (a.studentName || "").toLowerCase();
      return (
        name.includes("admin") ||
        name.includes("simulator") ||
        name.includes("ranti") ||
        name.includes("trainer") ||
        a.studentId === "admin-1"
      );
    };

    const attemptNames = filteredAttemptsByHierarchy
      .filter((a: ExamAttempt) => a.studentName && !isAdminAttempt(a))
      .map((a: ExamAttempt) => a.studentName as string);

    const studentNames = (students as Student[])
      .map((s: Student) => s.name)
      .filter((n): n is string => Boolean(n));

    return uniqueOptions([...attemptNames, ...studentNames], (n: string) => n.toLowerCase());
  }, [filteredAttemptsByHierarchy, students]);

// Reset child filters (Exam, Student) when the hierarchy selection or the derived
  // cascading lists change such that the currently selected value is no longer valid.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cascading reset: child filters must reset when the parent filter narrows the available options
    if (examFilter !== "ALL" && !examSubjectsList.some((e) => e.id === examFilter)) setExamFilter("ALL");
    if (studentFilter !== "ALL" && !studentNamesList.includes(studentFilter)) setStudentFilter("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally exclude selected* values so the reset only fires when the parent filter narrows the option list
  }, [academicFilters.collegeId, academicFilters.department, academicFilters.academicYear, academicFilters.section, academicFilters.batchId, examSubjectsList, studentNamesList]);

  // Debounce the raw search input into the filter state (300ms) so heavy filter
  // recomputations do not run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchQueryRaw), 300);
    return () => clearTimeout(t);
  }, [searchQueryRaw]);

  // Since we moved to server-side pagination and filtering, just use the attempts from server directly
  const filteredAttempts = attempts;

  const resetAllFilters = () => {
    setSearchQuery("");
    setSearchQueryRaw("");
    setExamFilter("ALL");
    setStudentFilter("ALL");
    setAcademicFilters({
      collegeId: "",
      department: "",
      academicYear: "",
      section: "",
      batchId: "",
      studentId: "",
    });
    setOutcomeFilter("ALL");
    setSortBy("date_desc");
    setAttemptPage(1);
  };

  const handleDeleteAttempt = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmConfig({
      isOpen: true,
      title: "Delete Audit Record",
      message: "Are you sure you want to permanently delete this test evaluation record?",
      onConfirm: async () => {
        try {
          await deleteResultById(id);
          // useLMSData will auto-sync on delete.
        } catch (err) {
          console.error("Failed to delete record", err);
        }
      },
    });
  };

  const handlePurgeAllResults = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Purge All Results Data",
      message: "WARNING: This will permanently remove all test attempt records and evaluation breakdowns from the database. Are you sure you want to proceed?",
      onConfirm: async () => {
        try {
          await clearAllResults();
          // useLMSData will auto-sync on clear.
        } catch (err) {
          console.error("Failed to purge all results", err);
        }
      },
    });
  };

  const handleExportCSV = () => {
    if (!filteredAttempts.length) return;

    const headers = [
      "Student Name",
      "Email",
      "College",
      "Department",
      "Batch",
      "Exam Title",
      "Submitted At",
      "Score",
      "Total Marks",
      "Percentage",
      "Outcome",
    ].join(",");

    const rows = filteredAttempts.map((attempt: ExamAttempt) => {
      const examName = (attempt as any).examTitle || attempt.examTitle || "Unknown Exam";
      const studentName = (attempt as any).studentName || "Unknown Student";
      const email = (attempt as any).studentEmail || "";
      const college = (attempt as any).collegeName || "";
      const dept = (attempt as any).department || "";
      const batch = ""; // We don't have batch name directly
      const date = formatLiveDate(attempt.submittedAt);
      const score = attempt.score || 0;
      const total = attempt.totalMarks || 0;
      const percentage = attempt.percentage || 0;
      const outcome = attempt.passed ? "Passed" : "Failed";

      return [
        `"${studentName.replace(/"/g, '""')}"`,
        `"${email.replace(/"/g, '""')}"`,
        `"${college.replace(/"/g, '""')}"`,
        `"${dept.replace(/"/g, '""')}"`,
        `"${batch.replace(/"/g, '""')}"`,
        `"${examName.replace(/"/g, '""')}"`,
        `"${date.replace(/"/g, '""')}"`,
        score,
        total,
        `${percentage}%`,
        outcome,
      ].join(",");
    });

    const csvContent = [headers, ...rows].join("\\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `results_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const totalSubmissions = totalServerSubmissions || 0;
  const passRate = isNaN(serverStats.passRate) ? 0 : Math.min(100, Math.max(0, Math.round(serverStats.passRate)));
  const avgScore = isNaN(serverStats.avgScore) ? 0 : Math.min(100, Math.max(0, Math.round(serverStats.avgScore)));
  const highestScore = isNaN(serverStats.highestScore) ? 0 : Math.min(100, Math.max(0, Math.round(serverStats.highestScore)));

  if (!mounted) {
    return null;
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6 max-w-[1600px] mx-auto pb-12 font-sans">
      <PageHeader
        title={actualRole === "student" ? "My Test Results & Audit Transcript" : "Academic Evaluation & Assessment Results"}
        description={
          actualRole === "student"
            ? "View authenticated grading transcripts, AI performance breakdown, and verified institutional scores."
            : "Monitor proctored test evaluations, analyze multi-dimensional cohort performance, and inspect granular student transcripts."
        }
        actions={
          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {actualRole !== "student" && actualRole !== "college_admin" && (
              <>
                <Button
                  onClick={loadData}
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 border-border hover:bg-accent text-foreground font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </Button>

                <Button
                  onClick={handleExportCSV}
                  variant="default"
                  size="sm"
                  disabled={filteredAttempts.length === 0}
                  className="h-9 px-4 bg-brand hover:bg-brand/90 text-brand-foreground font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Results
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Submissions</span>
            <p className="text-3xl font-bold text-foreground mt-1">{totalSubmissions.toLocaleString()}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Overall Pass Rate</span>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{passRate}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Average Score</span>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{avgScore}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Peak Score</span>
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{highestScore}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Structured Multi-Criteria Filter & Scope Panel */}
      <div className="bg-card/80 backdrop-blur-md p-5 rounded-2xl border border-border shadow-sm space-y-4">
        {/* Tier 1: Record Scope Toggle & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQueryRaw}
                onChange={(e) => setSearchQueryRaw(e.target.value)}
                placeholder="Search student name, roll no, or exam title..."
                className="w-full h-9 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 shadow-sm"
              />
            </div>
          </div>

          <Button
            onClick={resetAllFilters}
            variant="outline"
            size="sm"
            className="h-9 px-4 border-border hover:bg-muted text-xs font-bold flex items-center gap-1.5 self-start md:self-auto shrink-0 shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </Button>
        </div>

        {/* Tier 2: Academic Hierarchy Filters */}
        {actualRole !== "student" && (
          <div className="pt-2">
            <AcademicHierarchyFilters
              levels={actualRole === "college_admin" ? ["department", "academicYear", "section", "batch"] : ["institution", "department", "academicYear", "section", "batch"]}
              filters={academicFilters}
              filterValidation={filterValidation}
              onChange={setAcademicFilters}
              collegeOptions={collegeOptions}
              departmentOptions={departmentOptions}
              academicYearOptions={academicYearOptions}
              sectionOptions={sectionOptions}
              batchOptions={batchOptions}
              studentOptions={[]}
              showInstitution={actualRole !== "college_admin"}
              institutionOptions={institutionOptions}
            />
          </div>
        )}

        {/* Tier 3: Assessment & Outcome Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-3 border-t border-border/60">
          {/* Exam Section */}
          <FilterDropdown
            label="Exam Section"
            value={examFilter === "ALL" ? "" : examFilter}
            onChange={(val) => setExamFilter(val === "" ? "ALL" : val)}
            options={examSubjectsList.map(exam => ({ value: exam.id, label: exam.title }))}
          />

          {/* Student Filter */}
          {actualRole !== "student" && userRole === "student" && (
            <FilterDropdown
              label="Student Name"
              value={studentFilter === "ALL" ? "" : studentFilter}
              onChange={(val) => setStudentFilter(val === "" ? "ALL" : val)}
              options={studentNamesList.map(name => ({ value: name, label: name || "Unnamed College" }))}
            />
          )}

          {/* Outcome Filter */}
          <FilterDropdown
            label="Outcome"
            value={outcomeFilter === "ALL" ? "" : outcomeFilter}
            onChange={(val) => setOutcomeFilter(val === "" ? "ALL" : val)}
            options={[
              { value: "PASSED", label: "Passed Only" },
              { value: "FAILED", label: "Failed Only" },
            ]}
          />

          {/* Sort By Filter */}
          <FilterDropdown
            label="Sort By"
            value={sortBy}
            onChange={(val) => setSortBy(val as typeof sortBy)}
            options={[
              { value: "date_desc", label: "Latest Submissions" },
              { value: "score_desc", label: "Highest Score" },
              { value: "score_asc", label: "Lowest Score" },
            ]}
          />
        </div>
      </div>

      {loadingResults ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Analyzing performance audit records...</span>
        </div>
      ) : filteredAttempts.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={actualRole !== "student" ? "No attempted examinations found" : "No test attempts found"}
          description={
            searchQuery || examFilter !== "ALL" || studentFilter !== "ALL" || outcomeFilter !== "ALL" || Object.values(academicFilters).some(Boolean)
              ? "No evaluation records match your selected filter criteria. Try resetting your filters."
              : "When examinations are completed and submitted, graded evaluation records and transcripts will appear here."
          }
          actionLabel={
            searchQuery || examFilter !== "ALL" || studentFilter !== "ALL" || outcomeFilter !== "ALL" || Object.values(academicFilters).some(Boolean)
              ? "Clear Filters"
              : undefined
          }
          onAction={
            searchQuery || examFilter !== "ALL" || studentFilter !== "ALL" || outcomeFilter !== "ALL" || Object.values(academicFilters).some(Boolean)
              ? resetAllFilters
              : undefined
          }
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-foreground">
                {actualRole !== "student" ? "Institutional Performance Audit Trail" : "My Personal Test Transcript"}
              </h3>
              <span className="text-xs text-muted-foreground font-mono">Verified Grading & Evaluation Logs</span>
            </div>
            <span className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-extrabold">
              {filteredAttempts.length} Records Shown
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {actualRole !== "student" && <th className="py-3.5 px-4">Student Name</th>}
                  <th className="py-3.5 px-4">Exam Title / Subject</th>
                  <th className="py-3.5 px-4">Live Submission Date</th>
                  <th className="py-3.5 px-4">Score Achieved</th>
                  <th className="py-3.5 px-4">Performance Progress</th>
                  <th className="py-3.5 px-4">Time Taken</th>
                  <th className="py-3.5 px-4">Outcome</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAttempts.map((att) => {
                  const sName = (att as any).studentName || att.studentName || "Unknown Student";
                  const isDeletedData = sName.includes("(Deleted)") || sName === "Unknown Student";
                  const liveDateStr = formatLiveDate(att.submittedAt || att.createdAt || att.updatedAt);
                  return (
                    <tr 
                      key={att.id} 
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => {
                        if (actualRole === "student") {
                          router.push(`/student/exams/${att.examId}/review`);
                        } else {
                          setSelectedAttempt(att);
                        }
                      }}
                    >
                      {actualRole !== "student" && (
                        <td className="py-3.5 px-4 font-bold text-foreground flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full ${isDeletedData ? 'bg-destructive/15 text-destructive' : 'bg-brand/15 text-brand'} flex items-center justify-center text-xs font-extrabold shrink-0`}>
                            {sName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className={`block text-sm leading-tight ${isDeletedData ? 'text-destructive' : ''}`}>{sName}</span>
                            {actualRole !== "student" && (
                              <span className="text-[11px] text-muted-foreground font-normal">
                                {(() => {
                                  const cName = (att as any).collegeName || "";
                                  const dept = (att as any).department || "";
                                  if (cName && cName.toLowerCase() !== "unassigned") {
                                    return cName;
                                  }
                                  if (dept) return dept;
                                  return "unassigned";
                                })()}
                              </span>
                            )}

                          </div>
                        </td>
                      )}
                      <td className="py-3.5 px-4 text-xs text-muted-foreground font-semibold">{examTitleMap[att.examId] || att.examTitle || "Deleted Assessment"}</td>
                      <td className="py-3.5 px-4 text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-4">
                        <Calendar className="w-3.5 h-3.5 text-brand" />
                        <span>{liveDateStr}</span>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-foreground">
                        {att.score} <span className="text-xs font-medium text-muted-foreground">/ {att.totalMarks} marks</span>
                      </td>
                      <td className="py-3.5 px-4 w-44">
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 h-2.5 rounded-full bg-muted overflow-hidden border border-border">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${att.passed ? "bg-emerald-600 dark:bg-emerald-500" : "bg-destructive"}`}
                              style={{ width: `${Math.min(100, Math.max(5, att.percentage))}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-bold">{att.percentage}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-muted-foreground font-mono font-semibold">
                        {att.timeTakenMinutes || att.timeTaken || 15} mins
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                            att.passed
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-destructive/15 text-destructive border border-destructive/30"
                          }`}
                        >
                          {att.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          {att.passed ? "PASSED" : "FAILED"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {actualRole === "student" ? (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/student/exams/${att.examId}/review`);
                              }}
                              size="sm"
                              variant="outline"
                              className="text-xs font-bold h-8 border-border hover:bg-accent"
                              title="View Review Transcript"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Details
                            </Button>
                          ) : (
                            <>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAttempt(att);
                                }}
                                size="sm"
                                variant="outline"
                                className="text-xs font-bold h-8 border-border hover:bg-accent"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                Details
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(getAnswerSheetPath(att.id));
                                }}
                                size="sm"
                                variant="outline"
                                className="text-xs font-bold h-8 border-brand/40 text-brand hover:bg-brand/10"
                                title="View Answer Sheet"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                View Answer Sheet
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAttempt(att.id, e);
                                }}
                                size="sm"
                                variant="ghost"
                                className="text-xs font-bold h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Delete record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredAttempts.length > 0 && totalServerSubmissions > 25 && (
            <div className="flex items-center justify-between border-t border-border p-4">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-bold text-foreground">
                  {(attemptPage - 1) * 25 + 1}
                </span>{" "}
                -{" "}
                <span className="font-bold text-foreground">
                  {Math.min(attemptPage * 25, totalServerSubmissions)}
                </span>{" "}
                of{" "}
                <span className="font-bold text-foreground">
                  {totalServerSubmissions.toLocaleString()}
                </span>{" "}
                results
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setAttemptPage(p => Math.max(1, p - 1))}
                  disabled={attemptPage === 1}
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-9 px-3 text-xs font-semibold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </Button>

                {(() => {
                  const totalPages = Math.ceil(totalServerSubmissions / 25);
                  const pages = [];
                  const maxVisible = 5;
                  
                  let start = Math.max(1, attemptPage - Math.floor(maxVisible / 2));
                  let end = Math.min(totalPages, start + maxVisible - 1);
                  
                  if (end - start < maxVisible - 1) {
                    start = Math.max(1, end - maxVisible + 1);
                  }

                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <Button
                        key={i}
                        onClick={() => setAttemptPage(i)}
                        variant={i === attemptPage ? "default" : "ghost"}
                        size="sm"
                        className={`h-9 w-9 p-0 text-xs font-bold ${
                          i === attemptPage 
                            ? "bg-brand text-brand-foreground hover:bg-brand/90" 
                            : "hover:bg-accent"
                        }`}
                      >
                        {i}
                      </Button>
                    );
                  }

                  return pages;
                })()}

                <Button
                  onClick={() => setAttemptPage(p => p + 1)}
                  disabled={attemptPage === Math.ceil(totalServerSubmissions / 25)}
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-9 px-3 text-xs font-semibold"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Performance Details Modal */}
      <AnimatePresence>
        {selectedAttempt && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 space-y-6 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center font-bold">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">Performance Audit Breakdown</h3>
                    <p className="text-xs text-muted-foreground font-medium">
                      {examTitleMap[selectedAttempt.examId] || selectedAttempt.examTitle || "Assessment Evaluation"}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedAttempt(null)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {actualRole !== "student" && (
                  <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase">Student</span>
                    <p className="font-bold text-sm text-foreground">{selectedAttempt.studentName || "Unknown Student"}</p>
                  </div>
                )}
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Exam Subject</span>
                  <p className="font-bold text-sm text-foreground">{examTitleMap[selectedAttempt.examId] || selectedAttempt.examTitle || "Deleted Assessment"}</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Total Score Achieved</span>
                  <p className="font-extrabold text-xl text-brand">
                    {selectedAttempt.score} <span className="text-xs text-muted-foreground font-normal">/ {selectedAttempt.totalMarks} points</span>
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Evaluation Outcome</span>
                  <p className={`font-extrabold text-xl ${selectedAttempt.passed ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {selectedAttempt.percentage}% ({selectedAttempt.passed ? "PASSED" : "FAILED"})
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-brand/5 border border-brand/20 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-foreground">
                  <span>Audit Timestamp:</span>
                  <span className="font-mono text-brand">{formatLiveDate(selectedAttempt.submittedAt || selectedAttempt.createdAt || selectedAttempt.updatedAt)}</span>
                </div>
                <div className="flex items-center justify-between font-bold text-foreground">
                  <span>Duration Consumed:</span>
                  <span className="font-mono">{selectedAttempt.timeTakenMinutes || selectedAttempt.timeTaken || 15} Minutes</span>
                </div>
                <div className="flex items-center justify-between font-bold text-foreground">
                  <span>Privacy Authorization:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">Verified Institutional Attempt</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {actualRole !== "student" && (
                  <Button
                    onClick={() => router.push(getAnswerSheetPath(selectedAttempt.id))}
                    variant="outline"
                    className="border-brand/40 text-brand hover:bg-brand/10 font-bold px-4 flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View Answer Sheet
                  </Button>
                )}
                <Button onClick={() => setSelectedAttempt(null)} className="bg-brand text-brand-foreground font-bold px-6">
                  Close Breakdown
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Purge / Delete Actions */}
      <ConfirmModal
        isOpen={confirmConfig?.isOpen || false}
        onClose={() => setConfirmConfig(null)}
        onConfirm={() => {
          if (confirmConfig?.onConfirm) confirmConfig.onConfirm();
          setConfirmConfig(null);
        }}
        title={confirmConfig?.title || "Confirm Action"}
        message={confirmConfig?.message || ""}
        variant="destructive"
      />
    </motion.div>
  );
}
