"use client";

import { useEffect, useMemo, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Users, Plus, Upload, Download, Search, Trash2, Edit2, Ban, CheckCircle2, ChevronLeft, ChevronRight, AlertCircle, X, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { toast } from "sonner";
import { useSessionStorage } from "@/hooks/use-session-storage";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";
import { getStudentsPaginatedAction, getStudentFilterOptionsAction } from "@/lib/actions/student-actions";
import { deleteStudentProfile, updateStudentProfile, formatAuthError } from "@/lib/services";
import type { Student } from "@/types";
import { AddStudentModal } from "@/components/students/add-student-modal";
import { ImportStudentsModal } from "@/components/students/import-students-modal";

function StudentsPageContent() {
  // ===== ALL HOOKS AT THE TOP (NUCLEAR SAFETY) =====
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("admin");
  const [userCollegeId, setUserCollegeId] = useState<string>("");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useSessionStorage("students_page_currentPage", 1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize, setPageSize] = useState(25); // Default 25 for better scroll performance
  
  // Students data
  const [students, setStudents] = useState<any[]>([]);
  
  // Filter options (dynamically loaded from database)
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [sectionOptions, setSectionOptions] = useState<string[]>([]);
  
  // Filter state
  const [searchRaw, setSearchRaw] = useSessionStorage("students_page_searchRaw", "");
  const debouncedSearch = useDebounce(searchRaw, 300); // 300ms debounce
  const [collegeFilter, setCollegeFilter] = useSessionStorage("students_page_collegeFilter", "");
  const [departmentFilter, setDepartmentFilter] = useSessionStorage("students_page_departmentFilter", "");
  const [yearFilter, setYearFilter] = useSessionStorage("students_page_yearFilter", "");
  const [sectionFilter, setSectionFilter] = useSessionStorage("students_page_sectionFilter", "");
  const [statusFilter, setStatusFilter] = useSessionStorage("students_page_statusFilter", "");
  const [addedFilter, setAddedFilter] = useSessionStorage("students_page_addedFilter", "");
  
  const hasActiveFilters = Boolean(searchRaw || collegeFilter || departmentFilter || yearFilter || sectionFilter || statusFilter || addedFilter);
  
  const resetFilters = () => {
    setSearchRaw("");
    setCollegeFilter("");
    setDepartmentFilter("");
    setYearFilter("");
    setSectionFilter("");
    setStatusFilter("");
    setAddedFilter("");
  };

  // Reset child filters when parent filter changes (skip initial mount)
  const prevCollegeRef = useRef(collegeFilter);
  useEffect(() => {
    if (prevCollegeRef.current !== collegeFilter) {
      setDepartmentFilter("");
      setYearFilter("");
      setSectionFilter("");
      prevCollegeRef.current = collegeFilter;
    }
  }, [collegeFilter, setDepartmentFilter, setYearFilter, setSectionFilter]);

  const prevDeptYearRef = useRef(`${departmentFilter}-${yearFilter}`);
  useEffect(() => {
    const current = `${departmentFilter}-${yearFilter}`;
    if (prevDeptYearRef.current !== current) {
      setSectionFilter("");
      prevDeptYearRef.current = current;
    }
  }, [yearFilter, departmentFilter, setSectionFilter]);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Modal state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
    variant?: "destructive" | "warning" | "info" | "success";
  } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSmartImportModal, setShowSmartImportModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  // Get metadata from cache (for filter options)
  const colleges = useLMSDataSelector((s) => s.filteredColleges);

  // Load user role and college ID
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const role = localStorage.getItem("lms_role") || "admin";
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const profile = uStr ? JSON.parse(uStr) : {};
      const colId = profile.collegeId || "";
      
      setUserRole(role.toLowerCase());
      setUserCollegeId(colId);
    } catch (err) {
      console.error("Failed to load user data:", err);
    }
  }, []);

  // Load filter options when college changes
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const result = await getStudentFilterOptionsAction({
          userRole,
          userCollegeId,
          collegeId: collegeFilter,
        });

        if (result.success) {
          console.log('[STUDENTS] Filter options loaded:', {
            departments: result.departments.length,
            years: result.years.length,
            sections: result.sections.length,
          });
          setDepartmentOptions(result.departments);
          setYearOptions(result.years);
          setSectionOptions(result.sections);
        }
      } catch (err) {
        console.error("Failed to load filter options:", err);
      }
    };

    // Only load if we have role information
    if (userRole) {
      loadFilterOptions();
    }
  }, [collegeFilter, userRole, userCollegeId]);

  // Load students with pagination (GUARANTEED UNFREEZE via finally block)
  useEffect(() => {
    const loadStudents = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await getStudentsPaginatedAction({
          page: currentPage,
          pageSize,
          searchQuery: debouncedSearch,
          collegeId: collegeFilter,
          department: departmentFilter,
          academicYear: yearFilter,
          section: sectionFilter,
          status: statusFilter,
          addedFilter: addedFilter,
          userRole,
          userCollegeId,
        });

        console.log('[STUDENTS] Load result:', result);
        console.log('[STUDENTS] First 3 students:', result.data?.slice(0, 3));

        if (result.success) {
          console.log('[STUDENTS] Setting students:', result.data?.length, 'students');
          setStudents(result.data);
          setTotalCount(result.totalCount);
          setTotalPages(result.totalPages);
        } else {
          console.error('[STUDENTS] Error loading students:', result.error);
          setError(result.error || "Failed to load students");
          setStudents([]);
          setTotalCount(0);
          setTotalPages(0);
        }
      } catch (err) {
        console.error("Failed to load students:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        setStudents([]);
        setTotalCount(0);
        setTotalPages(0);
      } finally {
        // NUCLEAR GUARANTEE: Always unfreeze the UI
        setLoading(false);
      }
    };

    loadStudents();
  }, [currentPage, debouncedSearch, collegeFilter, departmentFilter, yearFilter, sectionFilter, statusFilter, addedFilter, userRole, userCollegeId]);

  // Bulletproof: Reset to page 1 ONLY if a filter ACTUALLY changed
  const prevFiltersRef = useRef({
    search: debouncedSearch,
    college: collegeFilter,
    dept: departmentFilter,
    year: yearFilter,
    section: sectionFilter,
    status: statusFilter,
    added: addedFilter,
    pageSize
  });
  
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.search !== debouncedSearch ||
      prev.college !== collegeFilter ||
      prev.dept !== departmentFilter ||
      prev.year !== yearFilter ||
      prev.section !== sectionFilter ||
      prev.status !== statusFilter ||
      prev.added !== addedFilter ||
      prev.pageSize !== pageSize
    ) {
      setCurrentPage(1);
      setSelectedIds(new Set());
      prevFiltersRef.current = {
        search: debouncedSearch,
        college: collegeFilter,
        dept: departmentFilter,
        year: yearFilter,
        section: sectionFilter,
        status: statusFilter,
        added: addedFilter,
        pageSize
      };
    }
  }, [debouncedSearch, collegeFilter, departmentFilter, yearFilter, sectionFilter, statusFilter, addedFilter, pageSize, setCurrentPage]);

  // Debug: Log students state changes
  useEffect(() => {
    console.log('[STUDENTS] Students state changed:', {
      length: students.length,
      loading,
      error,
      firstStudent: students[0],
    });
  }, [students, loading, error]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const toggleSelectStudent = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === students.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all on current page
      setSelectedIds(new Set(students.map(s => s.id)));
    }
  };

  const handleDeleteStudent = (student: any) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Student Account",
      message: `This will permanently remove ${student.name} (${student.email}) from the system. This action cannot be undone.`,
      variant: "destructive",
      onConfirm: async () => {
        const { globalLoading } = await import("@/providers/global-loading-provider");
        
        try {
          await globalLoading.wrap(async () => {
            const { deleteStudentProfileDirect } = await import("@/lib/services");
            await deleteStudentProfileDirect(student.id);
            
            // Reload data within the loading wrapper
            const result = await getStudentsPaginatedAction({
              page: currentPage,
              pageSize,
              searchQuery: debouncedSearch,
              collegeId: collegeFilter,
              department: departmentFilter,
              academicYear: yearFilter,
              section: sectionFilter,
              status: statusFilter,
              addedFilter: addedFilter,
              userRole,
              userCollegeId,
            });
            
            if (result.success) {
              setStudents(result.data);
              setTotalCount(result.totalCount);
              setTotalPages(result.totalPages);
              
              // If current page is now empty and it's not page 1, go to previous page
              if (result.data.length === 0 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
              }
            }
          }, `Deleting ${student.name}...`);
          
          // Success - show toast
          toast.success(`${student.name} has been permanently removed from the system.`);
        } catch (err) {
          console.error("Failed to delete student:", err);
          // Error - show toast
          toast.error(err instanceof Error ? err.message : "Failed to delete student. Please try again.");
        }
      },
    });
  };

  const handleToggleStatus = (student: any) => {
    const isRestricted = student.status === "restricted";
    const newStatus = isRestricted ? "active" : "restricted";

    setConfirmConfig({
      isOpen: true,
      title: isRestricted ? "Reactivate Student Account" : "Restrict Student Account",
      message: isRestricted
        ? `Reactivate "${student.name}"'s account? They will regain access immediately.`
        : `Restrict "${student.name}"'s account? They will not be able to log in.`,
      variant: isRestricted ? "info" : "warning",
      onConfirm: async () => {
        try {
          const res = await updateStudentProfile(student.id, { status: newStatus });
          if (!res.success) {
            throw new Error(res.error || "Failed to update status");
          }
          toast.success(`Account ${isRestricted ? "reactivated" : "restricted"}.`);
          
          // Reload current page
          const result = await getStudentsPaginatedAction({
            page: currentPage,
            pageSize,
            searchQuery: debouncedSearch,
            collegeId: collegeFilter,
            department: departmentFilter,
            academicYear: yearFilter,
            section: sectionFilter,
            status: statusFilter,
            userRole,
            userCollegeId,
          });
          
          if (result.success) {
            setStudents(result.data);
            setTotalCount(result.totalCount);
            setTotalPages(result.totalPages);
          }
        } catch (err) {
          console.error("Failed to update status:", err);
          toast.error(formatAuthError(err));
        }
      },
    });
  };

  // Edit student state
  const [editName, setEditName] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [editCollegeId, setEditCollegeId] = useState<string>("");
  const [editDepartment, setEditDepartment] = useState<string>("");
  const [editYear, setEditYear] = useState<string>("");
  const [editSection, setEditSection] = useState<string>("");
  const [editCustomSection, setEditCustomSection] = useState<string>("");
  const [editPassword, setEditPassword] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editCollegeDepartments, setEditCollegeDepartments] = useState<string[]>([]);

  const handleOpenEditModal = async (student: any) => {
    setEditingStudent(student);
    setEditName(student.name || "");
    setEditEmail(student.email || "");
    setEditCollegeId(student.collegeId || "");
    setEditDepartment(student.department || "");
    setEditYear(student.academicYear || "");
    const section = student.section || "A";
    const isKnownSection = ["A", "B", "C", "D"].includes(section);
    setEditSection(isKnownSection ? section : "CUSTOM");
    setEditCustomSection(isKnownSection ? "" : section);
    setEditPassword("");
    
    // Load departments for the student's current college
    if (student.collegeId) {
      try {
        const selectedCollege = colleges.find(c => c.id === student.collegeId);
        if (selectedCollege && selectedCollege.departments) {
          setEditCollegeDepartments(selectedCollege.departments);
        } else {
          setEditCollegeDepartments(["General"]);
        }
      } catch (err) {
        console.error("Failed to load college departments:", err);
        setEditCollegeDepartments(["General"]);
      }
    } else {
      setEditCollegeDepartments(["General"]);
    }
  };

  const handleEditCollegeChange = (newCollegeId: string) => {
    setEditCollegeId(newCollegeId);
    
    // Load departments for the new college
    if (newCollegeId) {
      const selectedCollege = colleges.find(c => c.id === newCollegeId);
      if (selectedCollege && selectedCollege.departments && selectedCollege.departments.length > 0) {
        setEditCollegeDepartments(selectedCollege.departments);
        // Set first department as default if current department doesn't exist in new college
        if (!selectedCollege.departments.includes(editDepartment)) {
          setEditDepartment(selectedCollege.departments[0]);
        }
      } else {
        setEditCollegeDepartments(["General"]);
        setEditDepartment("General");
      }
    } else {
      setEditCollegeDepartments(["General"]);
      setEditDepartment("General");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingStudent) return;
    
    // Validation
    if (!editName.trim()) {
      toast.error("Name is required.");
      return;
    }
    
    if (!editEmail.trim()) {
      toast.error("Email is required.");
      return;
    }
    
    const normalizedEmail = editEmail.toLowerCase().trim();
    
    setSavingEdit(true);

    try {
      // Check if email changed and if it's already in use
      if (normalizedEmail !== editingStudent.email.toLowerCase().trim()) {
        console.log('[EMAIL VALIDATION] Checking email uniqueness:', normalizedEmail);
        
        const [existingStudent, existingUsers] = await Promise.all([
          import("@/lib/services").then(m => m.getStudentByEmail(normalizedEmail)),
          import("@/lib/actions/settings-actions").then(m => m.getUsersByEmailAction(normalizedEmail)),
        ]);
        
        console.log('[EMAIL VALIDATION] Existing student:', existingStudent);
        console.log('[EMAIL VALIDATION] Existing users:', existingUsers);
        
        const isUsedByAnother =
          (existingStudent && existingStudent.id !== editingStudent.id) ||
          existingUsers.some((u: any) => u.id !== editingStudent.id && u.email?.toLowerCase() === normalizedEmail);
        
        if (isUsedByAnother) {
          console.error('[EMAIL VALIDATION] Email already exists!');
          toast.error("A student or user account with this email already exists.");
          setSavingEdit(false);
          return;
        }
        
        console.log('[EMAIL VALIDATION] Email is unique, proceeding...');
      }

      const payload: any = {
        name: editName.trim(),
        email: normalizedEmail,
        collegeId: editCollegeId || null,
        department: editDepartment,
        academicYear: editYear,
        section: editSection === "CUSTOM" ? editCustomSection.trim() || "A" : editSection,
      };

      // Add password if provided
      if (editPassword && editPassword.trim() !== "") {
        if (editPassword.trim().length < 6) {
          toast.error("Password must be at least 6 characters.");
          setSavingEdit(false);
          return;
        }
        payload.initialPassword = editPassword.trim();
      }

      // If college changed, handle batch removal
      const collegeChanged = editCollegeId !== editingStudent.collegeId;
      if (collegeChanged) {
        // Import batch services
        const { getAllBatches } = await import("@/lib/services");
        
        // Get all batches
        const batchesResult = await getAllBatches();
        const allBatches = batchesResult.data || [];
        
        // Filter student's current batches to keep only global ones
        const studentBatchIds = editingStudent.batchIds || [];
        const globalBatchIds = studentBatchIds.filter((batchId: string) => {
          const batch = allBatches.find(b => b.id === batchId);
          return batch && batch.type === "global";
        });
        
        // Update payload to only keep global batches
        payload.batchIds = globalBatchIds;
        
        console.log(`[COLLEGE CHANGE] Removing student from college-specific batches. Keeping ${globalBatchIds.length} global batch(es).`);
      }

      // Update student profile
      const updateResult = await updateStudentProfile(editingStudent.id, payload);
      
      console.log('[UPDATE RESULT]', updateResult);
      
      // Check if update failed
      if (updateResult && !updateResult.success) {
        const errorMsg = updateResult.error || "Failed to update student profile.";
        console.warn('[UPDATE FAILED]', errorMsg); // Changed from console.error
        toast.error(errorMsg);
        setSavingEdit(false);
        return;
      }

      toast.success(collegeChanged 
        ? "Student updated successfully. Removed from college-specific batches." 
        : "Student updated successfully");
      setEditingStudent(null);

      // Reload current page
      const result = await getStudentsPaginatedAction({
        page: currentPage,
        pageSize,
        searchQuery: debouncedSearch,
        collegeId: collegeFilter,
        department: departmentFilter,
        academicYear: yearFilter,
        section: sectionFilter,
        status: statusFilter,
        userRole,
        userCollegeId,
      });

      if (result.success) {
        setStudents(result.data);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
      }
    } catch (err) {
      console.error("Failed to update student:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to update student profile.";
      toast.error(errorMsg);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Students & Enrollment"
        description="Manage student accounts and enrollment"
        actions={
          userRole !== "student" ? (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowAddModal(true)}
                className="bg-brand hover:bg-brand/90 text-brand-foreground font-bold"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Student
              </Button>
              <Button onClick={() => setShowSmartImportModal(true)} variant="outline">
                <Upload className="w-4 h-4 mr-1.5" />
                Import CSV
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Filters Bar */}
      {userRole !== "student" && (
        <div className="bg-card p-4 rounded-xl border border-border space-y-4">
          {/* Search bar & Reset */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                placeholder="Search by name, email, or department..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>
            <Button
              variant="outline"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className={`h-10 px-4 shadow-sm transition-all ${
                hasActiveFilters 
                  ? "text-muted-foreground hover:text-foreground border-border bg-background hover:bg-muted/30" 
                  : "opacity-50 cursor-not-allowed text-muted-foreground/50 border-border/50 bg-background/50"
              }`}
            >
              <X className="w-4 h-4 mr-2" /> Reset
            </Button>
          </div>

          {/* Filter dropdowns */}
          <div className={`grid grid-cols-2 md:grid-cols-3 ${userRole !== "college_admin" ? "lg:grid-cols-6" : "lg:grid-cols-5"} gap-3`}>
            {/* College filter */}
            {userRole !== "college_admin" && (
              <select
                value={collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                <option value="">All Colleges</option>
                <option value="UNASSIGNED">Unassigned</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {/* Department filter */}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <option value="">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* Year filter */}
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <option value="">All Years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            {/* Section filter */}
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <option value="">All Sections</option>
              {sectionOptions.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="restricted">Restricted</option>
            </select>

            {/* Added filter */}
            <select
              value={addedFilter}
              onChange={(e) => setAddedFilter(e.target.value)}
              className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <option value="">All Addeds</option>
              <option value="Last 24 Hours">Last 24 Hours</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="CSV Uploads">CSV Uploads</option>
              <option value="Manual Entry">Manual Entry</option>
            </select>
          </div>
          
          {/* Bulk Actions Bar */}
          {students.length > 0 && (
            <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3 border border-border/60">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === students.length && students.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border bg-background text-brand focus:ring-brand/50 cursor-pointer"
                />
                <span className="text-sm font-medium text-foreground">
                  {selectedIds.size === 0 
                    ? "Select All" 
                    : `${selectedIds.size} selected`}
                </span>
                {selectedIds.size === 0 && currentPage > 1 && (
                  <button
                    onClick={() => setCurrentPage(1)}
                    className="ml-2 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                    title="Jump back to Page 1"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">Page 1</span>
                  </button>
                )}
              </div>
              
              {selectedIds.size > 0 && (
                <Button
                  onClick={() => {
                    // Bulk delete implementation
                    setConfirmConfig({
                      isOpen: true,
                      title: `Delete ${selectedIds.size} Students`,
                      message: `Are you sure you want to permanently delete ${selectedIds.size} student account(s)? This action cannot be undone.`,
                      variant: "destructive",
                      onConfirm: async () => {
                        const count = selectedIds.size;
                        const { globalLoading } = await import("@/providers/global-loading-provider");
                        
                        try {
                          await globalLoading.wrap(async () => {
                            // Delete all students
                            const { deleteStudentProfileDirect } = await import("@/lib/services");
                            await Promise.all(
                              Array.from(selectedIds).map((id) => deleteStudentProfileDirect(id))
                            );
                            
                            // Reload data within the loading wrapper
                            const result = await getStudentsPaginatedAction({
                              page: currentPage,
                              pageSize,
                              searchQuery: debouncedSearch,
                              collegeId: collegeFilter,
                              department: departmentFilter,
                              academicYear: yearFilter,
                              section: sectionFilter,
                              status: statusFilter,
                              userRole,
                              userCollegeId,
                            });
                            
                            if (result.success) {
                              setStudents(result.data);
                              setTotalCount(result.totalCount);
                              setTotalPages(result.totalPages);
                              
                              if (result.data.length === 0 && currentPage > 1) {
                                setCurrentPage(currentPage - 1);
                              }
                            }
                          }, `Deleting ${count} student account(s)...`);
                          
                          // Success - show toast
                          setSelectedIds(new Set());
                          toast.success(`${count} student account${count > 1 ? 's have' : ' has'} been permanently removed from the system.`);
                        } catch (err) {
                          console.error("Failed to delete students:", err);
                          // Error - show toast
                          toast.error(err instanceof Error ? err.message : "Failed to delete some students. Please try again.");
                        }
                      },
                    });
                  }}
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete {selectedIds.size}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-destructive mb-1">Failed to Load Students</h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline" 
                size="sm"
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="mt-4 text-sm text-muted-foreground font-medium">Loading students...</p>
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={userRole === "student" ? "No student profile found" : "No students found"}
          description={
            userRole === "student"
              ? "Your student profile could not be loaded. Contact your administrator."
              : "No students match your current filters. Try adjusting the search criteria or add new students."
          }
          actionLabel={userRole !== "student" ? "Add First Student" : undefined}
          onAction={userRole !== "student" ? () => setShowAddModal(true) : undefined}
        />
      ) : (
        <>
          {/* Students Table */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-bold">
                  <tr>
                    {userRole !== "student" && (
                      <th className="px-6 py-4 w-12">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === students.length && students.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-border bg-background text-brand focus:ring-brand/50 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="px-6 py-4">Student Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">College</th>
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4">Year</th>
                    <th className="px-6 py-4">Section</th>
                    <th className="px-6 py-4">Status</th>
                    {userRole !== "student" && <th className="px-6 py-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((student) => {
                    const isSelected = selectedIds.has(student.id);
                    return (
                      <tr
                        key={student.id}
                        onClick={(e) => {
                          // Don't navigate if clicking checkbox or action buttons
                          if (
                            (e.target as HTMLElement).closest('input[type="checkbox"]') ||
                            (e.target as HTMLElement).closest('button')
                          ) {
                            return;
                          }
                          // Show loading state and navigate to student detail page
                          import("@/providers/global-loading-provider").then(({ globalLoading }) => {
                            globalLoading.start("Loading Student Profile...");
                            router.push(`/students/${student.id}`);
                          });
                        }}
                        className={`hover:bg-muted/20 transition-colors cursor-pointer ${
                          isSelected ? 'bg-brand/5' : ''
                        }`}
                      >
                        {userRole !== "student" && (
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectStudent(student.id)}
                              className="w-4 h-4 rounded border-border bg-background text-brand focus:ring-brand/50 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs uppercase">
                              {student.name ? student.name.slice(0, 2) : "ST"}
                            </div>
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-bold text-foreground">{student.name}</p>
                                {student.rollNumber && (
                                  <p className="text-[11px] text-muted-foreground">
                                    Roll: {student.rollNumber}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">{student.email}</td>
                        <td className="px-6 py-4">
                          {student.collegeName ? (
                            <span className="text-xs font-medium text-foreground">{student.collegeName}</span>
                          ) : (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-brand/10 text-brand">
                            {student.department || "General"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-foreground">
                          {student.academicYear || "—"}
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-foreground">
                          {student.section || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                              student.status === "active"
                                ? "bg-green-500/10 text-green-600"
                                : "bg-rose-500/10 text-rose-600"
                            }`}
                          >
                            {student.status === "active" ? "Active" : "Restricted"}
                          </span>
                        </td>
                        {userRole !== "student" && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleToggleStatus(student)}
                                className="w-8 h-8 rounded-lg"
                                title={
                                  student.status === "restricted"
                                    ? "Reactivate account"
                                    : "Restrict account"
                                }
                              >
                                {student.status === "restricted" ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Ban className="w-4 h-4 text-amber-600" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleOpenEditModal(student)}
                                className="w-8 h-8 rounded-lg"
                                title="Edit student"
                              >
                                <Edit2 className="w-4 h-4 text-blue-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteStudent(student)}
                                className="w-8 h-8 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                                title="Delete student"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-6">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-bold text-foreground">
                  {(currentPage - 1) * pageSize + 1}
                </span>{" "}
                -{" "}
                <span className="font-bold text-foreground">
                  {Math.min(currentPage * pageSize, totalCount)}
                </span>{" "}
                of{" "}
                <span className="font-bold text-foreground">
                  {totalCount.toLocaleString()}
                </span>{" "}
                Students
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </Button>

                <div className="text-sm font-medium text-foreground px-4">
                  Page {currentPage} of {totalPages}
                </div>

                <Button
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Student Modal */}
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
                <div>
                  <h3 className="text-base font-bold text-foreground">Edit Student Profile</h3>
                  <p className="text-[11px] text-muted-foreground">Update name, email and hierarchy details</p>
                </div>
                <button
                  onClick={() => setEditingStudent(null)}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={savingEdit}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Full Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      placeholder="e.g. John Doe"
                      disabled={savingEdit}
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
                      placeholder="john@college.edu"
                      disabled={savingEdit}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">College</label>
                  <select
                    value={editCollegeId}
                    onChange={(e) => handleEditCollegeChange(e.target.value)}
                    disabled={savingEdit}
                    className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                  >
                    <option value="">Unassigned</option>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {editingStudent && editCollegeId !== editingStudent.collegeId && (
                    <p className="text-[10px] text-amber-500 flex items-start gap-1 mt-1">
                      <span className="text-amber-500 font-bold">⚠</span>
                      <span>Changing college will remove student from all college-specific batches (global batches remain)</span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department</label>
                    <select
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
                      disabled={savingEdit}
                      required
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      {editCollegeDepartments.length > 0 ? (
                        editCollegeDepartments.map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))
                      ) : (
                        <option value="General">General</option>
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Academic Year</label>
                    <select
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                      disabled={savingEdit}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      <option value="">Select year</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Section</label>
                  <select
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                    disabled={savingEdit}
                    className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                  >
                    <option value="">Select section</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                    <option value="CUSTOM">+ Custom Section...</option>
                  </select>
                  {editSection === "CUSTOM" && (
                    <input
                      type="text"
                      value={editCustomSection}
                      onChange={(e) => setEditCustomSection(e.target.value)}
                      placeholder="Type custom section"
                      disabled={savingEdit}
                      className="w-full h-9 px-3 mt-1.5 rounded-xl border border-brand bg-background text-foreground text-xs"
                    />
                  )}
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="font-semibold text-foreground flex items-center gap-1.5 text-emerald-500">
                    Login Password (Leave empty to keep unchanged)
                  </label>
                  <input
                    type="text"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Enter new login password for student..."
                    disabled={savingEdit}
                    className="w-full h-9 px-3 rounded-xl border border-emerald-500/40 bg-background text-foreground font-mono text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditingStudent(null)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={savingEdit} 
                    className="bg-brand text-brand-foreground"
                  >
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Student Modal */}
      <AddStudentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          // Just trigger a state change to reload students
          setCurrentPage(1);
          setSearchRaw(searchRaw + " ");
          setTimeout(() => setSearchRaw(searchRaw), 50);
        }}
        colleges={colleges}
        departments={departmentOptions}
        years={yearOptions}
        sections={sectionOptions}
      />

      {/* OG Import Modal */}
      <ImportStudentsModal
        isOpen={showSmartImportModal}
        onClose={() => setShowSmartImportModal(false)}
        onSuccess={() => {
          // Keep it open if they want to download credentials, let the modal handle its own state
          // but trigger reload
          setCurrentPage(1);
          setSearchRaw(searchRaw + " ");
          setTimeout(() => setSearchRaw(searchRaw), 50);
        }}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        onClose={() => setConfirmConfig(null)}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Confirm"
        variant={confirmConfig?.variant || "destructive"}
      />

    </motion.div>
  );

}

export default function StudentsPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-64px)] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div></div>}>
      <StudentsPageContent />
    </Suspense>
  );
}

