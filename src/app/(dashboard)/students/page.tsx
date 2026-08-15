
"use client";

import { useEffect, useMemo, useState, useRef, Suspense, useDeferredValue } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Users, Plus, Upload, Download, Search, FileSpreadsheet, FolderOpen, Sparkles, Trash2, StopCircle, Edit2, Ban, CheckCircle2, BarChart3, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { FilterDropdown } from "@/components/shared/filter-dropdown";
import { useDebounce } from "@/hooks/use-debounce";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import {
  getDepartmentsForCollege,
  getYearsForDepartment,
  getSectionsForYear,
  getBatchesForSection,
  filterStudentByAcademicFilters,
} from "@/lib/hierarchy/hierarchy-data";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { parseStudentsCSV, importStudentsCSV, generateCredentialsCSV, createStudentAuthProfile, updateCollege, deleteStudentProfile, updateStudentProfile, formatAuthError } from "@/lib/services";
import { useLMSData, useLMSDataSelector } from "@/lib/data/use-lms-data";
import { optimisticDeleteStudentFromCache as optimisticDeleteStudent, optimisticUpdateStudentInCache as optimisticUpdateStudent, refreshCache } from "@/lib/data/lms-data-cache";
import { StudentRow } from "@/components/students/student-row";
import { StudentCard } from "@/components/students/student-card";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import { toast } from "sonner";
import type { Student, CSVImportSummary, CSVStudentRow, College, Batch } from "@/types";

type TimestampLike = Date | { toMillis(): number } | { seconds: number } | string | number | null | undefined;

function getCreatedTime(date: TimestampLike): number {
  if (!date) return 0;
  if (typeof date === "object" && "toMillis" in date && typeof date.toMillis === "function") return date.toMillis();
  if (typeof date === "object" && "seconds" in date && typeof date.seconds === "number") return date.seconds * 1000;
  if (date instanceof Date) return date.getTime();
  return new Date(date as string | number).getTime() || 0;
}

function StudentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialCollegeId = searchParams.get("collegeId") || "";
  const initialBatchId = searchParams.get("batchId") || "";
  const actionParam = searchParams.get("action");
  const { userRole, userCollegeId } = useMemo(() => {
    if (typeof window === "undefined") return { userRole: "student", userCollegeId: "" };
    try {
      const role = localStorage.getItem("lms_role") || "student";
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const profile = uStr ? JSON.parse(uStr) : {};
      return { userRole: role, userCollegeId: profile.collegeId || "" };
    } catch {
      return { userRole: "student", userCollegeId: "" };
    }
  }, []);

  const students = useLMSDataSelector((s) => s.filteredStudents);
  const colleges = useLMSDataSelector((s) => s.filteredColleges);
  const batches = useLMSDataSelector((s) => s.filteredBatches);
  const lmsLoading = useLMSDataSelector((s) => s.loading);
  const { resolveInstitution, resolveBatch } = useEntityResolution();
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRaw, setSearchRaw] = useState("");
  const deferredSearch = useDeferredValue(searchRaw);
  const debouncedSearch = useDebounce(deferredSearch, 200);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [timeFilter, setTimeFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Shared academic hierarchy used by the filter bar and the add/edit modals.
  const {
    hierarchy,
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
    loading: hierarchyLoading,
  } = useAcademicHierarchy({
    initial: { collegeId: initialCollegeId },
    levels: ["institution", "department", "academicYear", "section", "batch"],
  });

  function getYearBadgeStyle(year?: string) {
    const y = year || "1st Year";
    if (y.includes("1")) return "bg-sky-500/15 text-sky-400 border border-sky-500/30";
    if (y.includes("2")) return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    if (y.includes("3")) return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    if (y.includes("4")) return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
    return "bg-brand/15 text-brand border border-brand/30";
  }

  // CSV Modal states
  const cancelImportRef = useRef(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<CSVImportSummary | null>(null);

  // Manual Add Student Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCollegeId, setNewCollegeId] = useState(initialCollegeId || "GLOBAL");
  const [newDepartment, setNewDepartment] = useState("Computer Science");
  const [newYear, setNewYear] = useState("1st Year");
  const [newSection, setNewSection] = useState("A");
  const [customNewSection, setCustomNewSection] = useState("");
  const [newBatch, setNewBatch] = useState(initialBatchId || "");

  // Edit Student Modal states
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCollegeId, setEditCollegeId] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  const [editYear, setEditYear] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editBatch, setEditBatch] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Fix initial loading flash by directly using derived state instead of useState
  const loading = hierarchyLoading || lmsLoading;

  useEffect(() => {
    if (userRole === "college_admin" && colleges.length > 0) {
      // ⚠️ CRITICAL FIX: College Admins must default to their assigned college, otherwise created students get 'GLOBAL' ID and disappear
      setNewCollegeId(colleges[0].id);
    } else if (initialCollegeId && colleges.find((c) => c.id === initialCollegeId)) {
      setNewCollegeId(initialCollegeId);
    }
  }, [hierarchyLoading, lmsLoading, initialCollegeId, colleges, userRole]);

  useEffect(() => {
    if (actionParam === "invite" || actionParam === "enroll") {
      /* eslint-disable react-hooks/set-state-in-effect -- opening modal from query param on mount */
      setShowAddModal(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } else if (actionParam === "import" || actionParam === "csv") {
       
      setShowImportModal(true);
       
    }
  }, [actionParam]);

  const fetchStudents = async () => {
    await refreshCache();
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setEditName(student.name || "");
    setEditEmail(student.email || "");
    setEditCollegeId(student.collegeId || "GLOBAL");
    setEditDepartment(student.department || "Computer Science");
    setEditYear(student.academicYear || "1st Year");
    setEditSection(student.section || "A");
    setEditPassword(""); // Leave empty to keep unchanged
  };

  const handleSaveEdit = async () => {
    if (!editingStudent) return;
    setSavingEdit(true);
    try {
      const originalCollege = editingStudent.collegeId || "GLOBAL";
      const isCollegeChanged = originalCollege !== editCollegeId;

      const selectedColObj = colleges.find((c) => c.id === editCollegeId);
      const colName = selectedColObj ? selectedColObj.name : (editCollegeId === "UNASSIGNED" ? "Unassigned" : "");
      const payload: Partial<Student> = {
        name: editName.trim(),
        collegeId: editCollegeId,
        collegeName: colName,
        department: editDepartment.trim(),
        academicYear: editYear,
        section: editSection.trim(),
      };

      if (isCollegeChanged) {
        // Automatically unassign and remove from all previous batches when college is changed
        payload.batchIds = [];
      }

      const newEmail = editEmail.toLowerCase().trim();
      if (newEmail !== editingStudent.email?.toLowerCase().trim()) {
        payload.email = newEmail;
      }

      if (editPassword && editPassword.trim() !== "") {
        if (editPassword.trim().length < 6) {
          toast.error("Password must be at least 6 characters.");
          setSavingEdit(false);
          return;
        }
        payload.initialPassword = editPassword.trim();
      }
      optimisticUpdateStudent(editingStudent.id, payload);
      const res = await updateStudentProfile(editingStudent.id, payload);
      if (!res.success) {
        toast.error(res.error || "Failed to update student profile.");
        await fetchStudents();
        return;
      }
      if (isCollegeChanged) {
        toast.success("Student profile updated. Unassigned from previous college batches.");
      } else {
        toast.success("Student profile updated successfully.");
      }
      await fetchStudents();
      setEditingStudent(null);
    } catch (err) {
      toast.error(formatAuthError(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFileUpload = async (filesOrEvent: React.ChangeEvent<HTMLInputElement> | File[]) => {
    let files: File[] = [];
    if (Array.isArray(filesOrEvent)) {
      files = filesOrEvent;
    } else if (filesOrEvent.target.files) {
      files = Array.from(filesOrEvent.target.files);
      filesOrEvent.target.value = "";
    }

    if (files.length === 0) return;

    cancelImportRef.current = false;
    setCancelling(false);
    setImporting(true);
    setImportSummary(null);
    setImportProgress(null);

    const allRows: CSVStudentRow[] = [];
    let hasUnsupportedExcel = false;
    
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".json") || !name.includes(".")) {
        const text = await file.text();
        const rows = parseStudentsCSV(text);
        allRows.push(...rows);
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        hasUnsupportedExcel = true;
        toast.error(`Excel files (.xlsx, .xls) are no longer supported due to security updates. Please convert your file to .csv format and try again.`);
      }
    }

    if (hasUnsupportedExcel && allRows.length === 0) {
      setImporting(false);
      return;
    }

    if (allRows.length === 0) {
      toast.error("No valid student rows with email addresses found in the selected file(s)/folder.");
      setImporting(false);
      return;
    }

    try {
      setImportProgress({ processed: 0, total: allRows.length });
      const summary = await importStudentsCSV(
        allRows,
        (processed, total) => {
          setImportProgress({ processed, total });
        },
        () => cancelImportRef.current
      );
      setImportSummary(summary);
      fetchStudents();
    } catch (err) {
      console.error("Import error", err);
      toast.error(formatAuthError(err));
    } finally {
      setImporting(false);
      setCancelling(false);
      setImportProgress(null);
    }
  };

  const handleDownloadCredentials = () => {
    if (!importSummary) return;
    const csvContent = generateCredentialsCSV(importSummary.results);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `student_credentials_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail) return;
    setCreating(true);
    try {
      const colObj = colleges.find((c) => c.id === newCollegeId);
      const colName = colObj ? colObj.name : (newCollegeId === "UNASSIGNED" ? "Unassigned" : newCollegeId);

      await createStudentAuthProfile({
        email: newEmail,
        name: newName,
        collegeId: newCollegeId,
        collegeName: colName,
        department: newDepartment,
        academicYear: newYear,
        section: newSection === "CUSTOM" ? customNewSection.trim() || "A" : newSection,
        batch: newBatch,
      });

      if (colObj) {
        await updateCollege(colObj.id, {
          studentCount: (colObj.studentCount || 0) + 1,
        });
      }

      setShowAddModal(false);
      setNewName("");
      setNewEmail("");
      setCustomNewSection("");
      fetchStudents();
      setConfirmConfig({
        isOpen: true,
        isAlert: true,
        title: "Student Enrolled",
        message: `The student can sign in with ${newEmail.toLowerCase().trim()} and the default password (e.g. Welcome@123).`,
        variant: "success",
      });
    } catch (err: unknown) {
      const message = formatAuthError(err);
      setConfirmConfig({
        isOpen: true,
        isAlert: true,
        title: "Account Creation Failed",
        message,
        variant: "warning",
      });
    } finally {
      setCreating(false);
    }
  };

  // Debounce the raw search input into the filter state (300ms) so heavy filter
  // recomputations do not run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchRaw), 300);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const filteredStudents = useMemo(
    () =>
      students
        .filter((s) => {
          if (s.isDeleted) return false;

          const searchVal = (debouncedSearch || "").toLowerCase();
          const matchesSearch =
            (s.name || "").toLowerCase().includes(searchVal) ||
            (s.email || "").toLowerCase().includes(searchVal) ||
            (s.department || "").toLowerCase().includes(searchVal);
            
          const matchesHierarchy = filterStudentByAcademicFilters(s, academicFilters);

          const now = new Date().getTime();
          const createdTime = getCreatedTime(s.createdAt);
          let matchesTime = false;
          if (timeFilter === "ALL") matchesTime = true;
          else if (timeFilter === "RECENT_24H") matchesTime = !!createdTime && now - createdTime <= 24 * 60 * 60 * 1000;
          else if (timeFilter === "RECENT_7D") matchesTime = !!createdTime && now - createdTime <= 7 * 24 * 60 * 60 * 1000;
          else if (timeFilter === "CSV") matchesTime = s.enrollmentType === "csv";
          else if (timeFilter === "MANUAL") matchesTime = s.enrollmentType === "manual" || !s.enrollmentType;
          else if (timeFilter === "SELF") matchesTime = s.enrollmentType === "self";

          return matchesSearch && matchesHierarchy && matchesTime;
        })
        .sort((a, b) => {
          if (timeFilter === "RECENT_24H" || timeFilter === "RECENT_7D") {
            const timeA = getCreatedTime(a.createdAt);
            const timeB = getCreatedTime(b.createdAt);
            return timeB - timeA;
          }
          return 0;
        }),
    [students, debouncedSearch, academicFilters, timeFilter]
  );

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage, itemsPerPage]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, academicFilters, timeFilter]);

  // Cascading options for the manual-add modal.
  const addModalDepartments = useMemo(
    () => (hierarchy ? getDepartmentsForCollege(hierarchy, newCollegeId) : []),
    [hierarchy, newCollegeId]
  );
  const addModalYears = useMemo(
    () => (hierarchy ? getYearsForDepartment(hierarchy, newCollegeId, newDepartment) : []),
    [hierarchy, newCollegeId, newDepartment]
  );
  const addModalSections = useMemo(
    () => (hierarchy ? getSectionsForYear(hierarchy, newCollegeId, newDepartment, newYear) : []),
    [hierarchy, newCollegeId, newDepartment, newYear]
  );
  const availableBatchesForAdd = useMemo(() => {
    if (!newCollegeId || newCollegeId === "GLOBAL" || newCollegeId === "ALL" || newCollegeId === "UNASSIGNED") {
      return batches;
    }
    return batches.filter((b) => !b.collegeId || b.collegeId === "global" || b.collegeId === newCollegeId);
  }, [batches, newCollegeId]);

  // Cascading options for the edit modal.
  const editModalDepartments = useMemo(
    () => (hierarchy ? getDepartmentsForCollege(hierarchy, editCollegeId) : []),
    [hierarchy, editCollegeId]
  );
  const editModalYears = useMemo(
    () => (hierarchy ? getYearsForDepartment(hierarchy, editCollegeId, editDepartment) : []),
    [hierarchy, editCollegeId, editDepartment]
  );
  const editModalSections = useMemo(
    () => (hierarchy ? getSectionsForYear(hierarchy, editCollegeId, editDepartment, editYear) : []),
    [hierarchy, editCollegeId, editDepartment, editYear]
  );
  const availableBatchesForEdit = useMemo(() => {
    if (!editCollegeId || editCollegeId === "GLOBAL" || editCollegeId === "ALL" || editCollegeId === "UNASSIGNED") {
      return batches;
    }
    return batches.filter((b) => !b.collegeId || b.collegeId === "global" || b.collegeId === editCollegeId);
  }, [batches, editCollegeId]);

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Selected Student Accounts",
      message: `This will permanently delete ${selectedIds.length} selected student account(s) from the system. The student will lose all access and must create a new account. Exam results will remain and be marked as "Student Deleted Data". This action cannot be undone.`,
      variant: "destructive",
      onConfirm: async () => {
        try {
          selectedIds.forEach((id) => optimisticDeleteStudent(id));
          const currentSelected = [...selectedIds];
          setSelectedIds([]);
          await Promise.all(currentSelected.map((id) => deleteStudentProfile(id)));
          toast.success(`Deleted ${currentSelected.length} student account(s).`);
        } catch (err) {
          console.error("Failed to delete selected students:", err);
          toast.error(formatAuthError(err));
        }
      }
    });
  };

  const handleToggleStatus = (student: Student) => {
    const isRestricted = student.status === "restricted";
    const newStatus = isRestricted ? "active" : "restricted";

    if (!isRestricted) {
      // Show confirmation dialog before restricting
      setConfirmConfig({
        isOpen: true,
        title: "Restrict Student Account",
        message: `Are you sure you want to restrict "${student.name}"'s account? The student will not be able to log in until the account is reactivated.`,
        variant: "warning",
        onConfirm: async () => {
          try {
            optimisticUpdateStudent(student.id, { status: newStatus });
            await updateStudentProfile(student.id, { status: newStatus });
            await refreshCache();
            toast.success(`Account for "${student.name}" restricted.`);
          } catch (err) {
            console.error("Failed to restrict account:", err);
            await refreshCache();
            toast.error(formatAuthError(err));
          }
        }
      });
    } else {
      // Show confirmation dialog before reactivating
      setConfirmConfig({
        isOpen: true,
        title: "Reactivate Student Account",
        message: `Are you sure you want to reactivate "${student.name}"'s account? They will immediately regain access to the LMS.`,
        variant: "info",
        onConfirm: async () => {
          try {
            optimisticUpdateStudent(student.id, { status: newStatus });
            await updateStudentProfile(student.id, { status: newStatus });
            await refreshCache();
            toast.success(`Account for "${student.name}" reactivated.`);
          } catch (err) {
            console.error("Failed to reactivate account:", err);
            await refreshCache();
            toast.error(formatAuthError(err));
          }
        }
      });
    }
  };

  const handleDeleteStudent = (student: Student) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Student Account",
      message: `This will permanently remove ${student.name} (${student.email}) from the system. The student will no longer have access and must create a new account to regain access. Exam results will remain and be labelled "Student Deleted Data".`,
      variant: "destructive",
      onConfirm: async () => {
        // Optimistic UI update
        optimisticDeleteStudent(student.id);
        setSelectedIds((prev) => prev.filter((id) => id !== student.id));
        toast.success(`Student profile for ${student.name} deleted.`);

        try {
          await deleteStudentProfile(student.id);
        } catch (err) {
          console.error("Failed to delete student on backend:", err);
          toast.error(formatAuthError(err));
        }
      }
    });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Students & Enrollment"
        description="Enroll students manually into specific colleges, departments, and custom batches, or import CSV lists."
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-brand hover:bg-brand/90 text-brand-foreground flex items-center justify-center gap-2 font-bold h-11 px-4 sm:px-6 rounded-xl w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Invite / Enroll Student</span>
            </Button>
            <Button
              onClick={() => {
                setImportSummary(null);
                setShowImportModal(true);
              }}
              className="bg-brand/10 hover:bg-brand/20 border-0 text-brand flex items-center justify-center gap-2 font-bold h-11 px-4 sm:px-6 rounded-xl w-full sm:w-auto"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Import CSV</span>
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="bg-card p-4.5 rounded-xl border border-border space-y-3.5 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Search student name, email address or department..."
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 font-medium"
            />
          </div>
          <div className="text-xs font-bold text-muted-foreground self-end sm:self-center">
            Showing <span className="text-foreground">{filteredStudents.length}</span> of {students.length} Students
          </div>
        </div>

        <div className="pt-3 border-t border-border/60">
          <AcademicHierarchyFilters
            levels={["institution", "department", "academicYear", "section", "batch"]}
            filters={academicFilters}
            filterValidation={filterValidation}
            onChange={setAcademicFilters}
            onReset={resetAcademicFilters}
            collegeOptions={collegeOptions}
            departmentOptions={departmentOptions}
            academicYearOptions={academicYearOptions}
            sectionOptions={sectionOptions}
            batchOptions={batchOptions}
            studentOptions={[]}
            loading={hierarchyLoading}
            showInstitution
            institutionOptions={institutionOptions}
            appendContent={
              <FilterDropdown
                label="Added Time"
                value={timeFilter === "ALL" ? "" : timeFilter}
                onChange={(val) => setTimeFilter(val === "" ? "ALL" : val)}
                options={[
                  { value: "RECENT_24H", label: "Last 24 Hours" },
                  { value: "RECENT_7D", label: "Last 7 Days" },
                  { value: "CSV", label: "CSV Uploads" },
                  { value: "MANUAL", label: "Manual Entry" },
                ]}
              />
            }
          />
        </div>
      </div>

      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-foreground"
        >
          <div className="flex items-center gap-2 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span>{selectedIds.length} Student Profile{selectedIds.length > 1 ? "s" : ""} Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds([])}
              className="h-8 px-3 text-xs border-border hover:bg-background"
            >
              Deselect All
            </Button>
            <Button
              size="sm"
              onClick={handleDeleteSelected}
              className="h-8 px-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </Button>
          </div>
        </motion.div>
      )}

      {lmsLoading && students.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading student records...</span>
        </div>
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={Users}
          title={students.length === 0 ? "No students enrolled yet" : "No matching students found"}
          description={
            students.length === 0
              ? "Upload a CSV file with columns: Student Name, College Email, College, Department, Academic Year, Section, Batch."
              : "Try adjusting your search query or college filter."
          }
          actionLabel="Import Students via CSV"
          onAction={() => setShowImportModal(true)}
        />
      ) : (
        <div className="space-y-4">
          {/* Mobile Stacked Card View (<640px) */}
          <div className="block sm:hidden space-y-3">
            {paginatedStudents.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                isSelected={selectedIds.includes(student.id)}
                onToggleSelect={(id) => {
                  setSelectedIds((prev) =>
                    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                  );
                }}
                onOpenEdit={handleOpenEdit}
                onToggleStatus={handleToggleStatus}
                onDeleteStudent={handleDeleteStudent}
                resolveInstitution={resolveInstitution}
                resolveBatch={resolveBatch}
                pathname={pathname}
              />
            ))}
          </div>

          {/* Desktop Responsive Table View (>=640px) */}
          <div className="hidden sm:block rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3.5 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={filteredStudents.length > 0 && selectedIds.length === filteredStudents.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filteredStudents.map((s) => s.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                        className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer w-4 h-4"
                      />
                    </th>
                    <th className="py-3.5 px-4">Student Name</th>
                    <th className="py-3.5 px-4">Email Address</th>
                    <th className="py-3.5 px-4">College</th>
                    <th className="py-3.5 px-4">Department & Year</th>
                    <th className="py-3.5 px-4">Section / Batch</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {paginatedStudents.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      isSelected={selectedIds.includes(student.id)}
                      onToggleSelect={(id) => {
                        setSelectedIds((prev) =>
                          prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                        );
                      }}
                      onOpenEdit={handleOpenEdit}
                      onToggleStatus={handleToggleStatus}
                      onDeleteStudent={handleDeleteStudent}
                      resolveInstitution={resolveInstitution}
                      resolveBatch={resolveBatch}
                      pathname={pathname}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <span className="text-xs text-muted-foreground font-medium">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} entries
              </span>
              <div className="flex gap-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 text-xs font-semibold"
                >
                  Previous
                </Button>
                <div className="flex items-center justify-center px-3 text-xs font-bold text-foreground">
                  Page {currentPage} of {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 text-xs font-semibold"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk CSV Upload Modal */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Bulk CSV Student Import</h3>
                    <p className="text-xs text-muted-foreground">Automatic Firebase Auth accounts & temporary password provisioning</p>
                  </div>
                </div>
                <button
                  onClick={() => !importing && setShowImportModal(false)}
                  disabled={importing}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  ✕
                </button>
              </div>

              {!importSummary && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-accent/40 border border-border text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <Sparkles className="w-4 h-4 text-brand" />
                      <span>Required CSV Column Headers:</span>
                    </div>
                    <code className="block p-2 rounded bg-background font-mono text-[11px] text-foreground border border-border">
                      Student Name, College Email, College, Department, Academic Year, Section, Batch
                    </code>
                    <p>
                      Passswords are dynamically generated by Firebase Auth and will NOT be saved inside Firestore. You can download the generated credentials CSV after upload.
                    </p>
                  </div>

                  {importing ? (
                    <div className="border-2 border-brand/50 rounded-2xl p-6 text-center space-y-4 bg-brand/5">
                      <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin mx-auto" />
                      <div className="space-y-2">
                        <p className="text-base font-bold text-foreground">
                          {importProgress && importProgress.total > 0
                            ? `Processing Accounts: ${importProgress.processed} / ${importProgress.total} (${Math.round((importProgress.processed / importProgress.total) * 100)}%)`
                            : "Initializing CSV Import..."}
                        </p>
                        {importProgress && importProgress.total > 0 && (
                          <div className="w-full max-w-xs mx-auto bg-border rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-brand h-full transition-all duration-300 rounded-full"
                              style={{ width: `${Math.round((importProgress.processed / importProgress.total) * 100)}%` }}
                            />
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                          Creating secure cryptographic accounts in Firebase Auth (~1 second per batch). Please stay on this page while processing completes.
                        </p>
                      </div>
                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={cancelling}
                          onClick={() => {
                            setCancelling(true);
                            cancelImportRef.current = true;
                          }}
                          className="flex items-center gap-1.5 mx-auto bg-destructive/20 hover:bg-destructive text-destructive hover:text-white border border-destructive/30 transition-all disabled:opacity-80"
                        >
                          {cancelling ? (
                            <>
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              <span>Stopping... Finalizing current batch...</span>
                            </>
                          ) : (
                            <>
                              <StopCircle className="w-4 h-4" />
                              <span>Stop Processing & Save Progress</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const droppedFiles: File[] = [];
                        const items = e.dataTransfer.items;
                        if (items) {
                          const readEntry = async (entry: any) => {
                            if (entry.isFile) {
                              return new Promise<void>((resolve) => {
                                entry.file((f: File) => {
                                  if (f.name.toLowerCase().endsWith(".csv")) droppedFiles.push(f);
                                  resolve();
                                });
                              });
                            } else if (entry.isDirectory) {
                              const dirReader = entry.createReader();
                              const entries: any[] = await new Promise((res) => dirReader.readEntries((r: any) => res(r)));
                              for (const sub of entries) {
                                await readEntry(sub);
                              }
                            }
                          };
                          for (let i = 0; i < items.length; i++) {
                            const entry = items[i].webkitGetAsEntry?.();
                            if (entry) await readEntry(entry);
                          }
                        }
                        if (droppedFiles.length > 0) {
                          handleFileUpload(droppedFiles);
                        } else if (e.dataTransfer.files.length > 0) {
                          handleFileUpload(Array.from(e.dataTransfer.files));
                        }
                      }}
                      className="border-2 border-dashed border-border hover:border-brand/70 rounded-2xl p-8 text-center space-y-4 transition-colors bg-background/50"
                    >
                      <FileSpreadsheet className="w-10 h-10 text-brand mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Select or Drag & Drop CSV / Data File(s) or Entire Folder</p>
                        <p className="text-xs text-muted-foreground">Upload single files, multiple CSVs, or select a whole folder</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-xs font-bold cursor-pointer hover:bg-brand/90 transition-all shadow-sm">
                          <FileSpreadsheet className="w-4 h-4 shrink-0" />
                          <span>Select CSV / Data File(s)</span>
                          <input
                            type="file"
                            accept=".csv,.txt,.json,.xls,.xlsx,text/csv,text/plain,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            multiple
                            onChange={handleFileUpload}
                            disabled={importing}
                            className="hidden"
                          />
                        </label>
                        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-foreground border border-border text-xs font-bold cursor-pointer hover:bg-accent/80 transition-all shadow-sm">
                          <FolderOpen className="w-4 h-4 text-brand shrink-0" />
                          <span>Select Entire Folder</span>
                          <input
                            type="file"
                            {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                            multiple
                            onChange={handleFileUpload}
                            disabled={importing}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Import Summary Results */}
              {importSummary && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-xs text-muted-foreground font-medium">Created</span>
                      <p className="text-2xl font-bold text-emerald-500">{importSummary.createdCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="text-xs text-muted-foreground font-medium">Duplicates</span>
                      <p className="text-2xl font-bold text-amber-500">{importSummary.duplicateCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                      <span className="text-xs text-muted-foreground font-medium">Skipped</span>
                      <p className="text-2xl font-bold text-slate-400">{importSummary.skippedCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                      <span className="text-xs text-muted-foreground font-medium">Failed</span>
                      <p className="text-2xl font-bold text-destructive">{importSummary.failedCount}</p>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto rounded-xl border border-border text-xs bg-background">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-card dark:bg-slate-900 text-foreground font-bold border-b border-border sticky top-0 z-20 shadow-sm">
                        <tr>
                          <th className="px-4 py-3 bg-card dark:bg-slate-900">Name</th>
                          <th className="px-4 py-3 bg-card dark:bg-slate-900">Email</th>
                          <th className="px-4 py-3 bg-card dark:bg-slate-900">Status</th>
                          <th className="px-4 py-3 bg-card dark:bg-slate-900">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importSummary.results.map((res, i) => (
                          <tr key={i} className="hover:bg-muted/40">
                            <td className="px-4 py-3 font-medium text-foreground">{res.name}</td>
                            <td className="px-4 py-3 font-mono text-muted-foreground">{res.email}</td>
                            <td className="px-4 py-3">
                              {res.status === "created" && <span className="text-emerald-500 font-bold">Created</span>}
                              {res.status === "duplicate" && <span className="text-amber-500 font-bold">Duplicate</span>}
                              {res.status === "skipped" && <span className="text-slate-400 font-semibold">Skipped</span>}
                              {res.status === "failed" && <span className="text-destructive font-bold">Failed</span>}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{res.reason || `Pass: ${res.password}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border mt-4">
                    {importSummary.createdCount > 0 ? (
                      <Button onClick={handleDownloadCredentials} className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-bold shadow-sm">
                        <Download className="w-4 h-4 shrink-0" />
                        <span>Download Credentials CSV ({importSummary.createdCount} Accounts)</span>
                      </Button>
                    ) : (
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
                        <span>No new accounts created in this batch.</span>
                      </div>
                    )}
                    <Button onClick={() => setShowImportModal(false)} variant="outline" className="h-11 px-6 rounded-xl font-semibold">
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Enroll Student Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Enroll Student Profile</h3>
                <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateStudent} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Full Name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                      placeholder="e.g. Rahul Sharma"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Email Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      placeholder="rahul@college.edu"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">College / Scope</label>
                    <select
                      value={newCollegeId}
                      onChange={(e) => setNewCollegeId(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >

                      {userRole !== "college_admin" && (
                        <option value="UNASSIGNED">Unassigned</option>
                      )}
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || "Unnamed College"}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department</label>
                    <select
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      {addModalDepartments.length === 0 ? (
                        <option value={newDepartment}>{newDepartment}</option>
                      ) : (
                        addModalDepartments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Academic Year</label>
                    <select
                      value={newYear}
                      onChange={(e) => setNewYear(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      {addModalYears.length === 0 ? (
                        <option value={newYear}>{newYear}</option>
                      ) : (
                        addModalYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Section</label>
                    <select
                      value={newSection}
                      onChange={(e) => setNewSection(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      {addModalSections.length === 0 ? (
                        <option value={newSection}>{newSection}</option>
                      ) : (
                        addModalSections.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec}
                          </option>
                        ))
                      )}
                      <option value="CUSTOM">+ Custom Section...</option>
                    </select>
                    {newSection === "CUSTOM" && (
                      <input
                        type="text"
                        value={customNewSection}
                        onChange={(e) => setCustomNewSection(e.target.value)}
                        required
                        placeholder="Type custom section (e.g. Sec E, Honors)"
                        className="w-full h-9 px-3 mt-1.5 rounded-xl border border-brand bg-background text-foreground text-xs"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Custom Batch</label>
                    <select
                      value={newBatch}
                      onChange={(e) => setNewBatch(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      <option value="">None (No Batch)</option>
                      {availableBatchesForAdd.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name || "Unnamed Batch"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-brand hover:bg-brand/90 text-brand-foreground">
                    {creating ? "Enrolling..." : "Enroll Student"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Student Profile Modal */}
      <AnimatePresence>
        {editingStudent && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Edit Student Profile</h3>
                <button onClick={() => setEditingStudent(null)} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveEdit();
                }}
                className="space-y-4 text-xs"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Full Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Email Address</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      required
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">College / Scope</label>
                    <select
                      value={editCollegeId}
                      onChange={(e) => setEditCollegeId(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >

                      {userRole !== "college_admin" && (
                        <option value="UNASSIGNED">Unassigned</option>
                      )}
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || "Unnamed College"}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department</label>
                    <select
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      {editModalDepartments.length === 0 ? (
                        <option value={editDepartment}>{editDepartment}</option>
                      ) : (
                        editModalDepartments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {editingStudent && (editingStudent.collegeId || "GLOBAL") !== editCollegeId && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-600 dark:text-amber-400 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">College / Scope Changed</p>
                      <p className="text-[11px] opacity-90">
                        Changing the college will automatically unassign and remove this student from all previously assigned batches and cohorts.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Academic Year</label>
                    <select
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      {editModalYears.length === 0 ? (
                        <option value={editYear}>{editYear}</option>
                      ) : (
                        editModalYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Section</label>
                    <select
                      value={editSection}
                      onChange={(e) => setEditSection(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      {editModalSections.length === 0 ? (
                        <option value={editSection}>{editSection}</option>
                      ) : (
                        editModalSections.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="font-semibold text-foreground flex items-center gap-1.5 text-emerald-500">
                    Login Password (Leave empty to keep unchanged)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter new login password for student..."
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-emerald-500/40 bg-background text-foreground font-mono text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setEditingStudent(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingEdit} className="bg-brand hover:bg-brand/90 text-brand-foreground">
                    {savingEdit ? "Saving..." : "Save Live Changes"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        onClose={() => setConfirmConfig(null)}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Confirm"
        variant={confirmConfig?.variant || "destructive"}
        isAlert={confirmConfig?.isAlert}
      />
    </motion.div>
  );
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-muted-foreground">Loading enrollment hub...</div>}>
      <StudentsContent />
    </Suspense>
  );
}
