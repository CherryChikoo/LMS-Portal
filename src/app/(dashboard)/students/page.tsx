"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Users, Plus, Upload, Download, Search, Trash2, Edit2, Ban, CheckCircle2, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { toast } from "sonner";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";
import { getStudentsPaginatedAction, getStudentFilterOptionsAction } from "@/lib/actions/student-actions";
import { deleteStudentProfile, updateStudentProfile, formatAuthError } from "@/lib/services";
import type { Student } from "@/types";

export default function StudentsPage() {
  // ===== ALL HOOKS AT THE TOP (NUCLEAR SAFETY) =====
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("admin");
  const [userCollegeId, setUserCollegeId] = useState<string>("");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const pageSize = 100;
  
  // Students data
  const [students, setStudents] = useState<any[]>([]);
  
  // Filter options (dynamically loaded from database)
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [sectionOptions, setSectionOptions] = useState<string[]>([]);
  
  // Filter state
  const [searchRaw, setSearchRaw] = useState("");
  const debouncedSearch = useDebounce(searchRaw, 300); // 300ms debounce
  const [collegeFilter, setCollegeFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  
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
  const [showImportModal, setShowImportModal] = useState(false);
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
  }, [currentPage, debouncedSearch, collegeFilter, departmentFilter, yearFilter, sectionFilter, statusFilter, userRole, userCollegeId]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, collegeFilter, departmentFilter, yearFilter, sectionFilter, statusFilter]);

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
        try {
          await deleteStudentProfile(student.id);
          toast.success(`Student profile deleted.`);
          
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
            
            // If current page is now empty and it's not page 1, go to previous page
            if (result.data.length === 0 && currentPage > 1) {
              setCurrentPage(currentPage - 1);
            }
          }
        } catch (err) {
          console.error("Failed to delete student:", err);
          toast.error(formatAuthError(err));
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
          await updateStudentProfile(student.id, { status: newStatus });
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
              <Button onClick={() => setShowImportModal(true)} variant="outline">
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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Search by name, email, or department..."
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>

          {/* Filter dropdowns */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* College filter */}
            {userRole !== "college_admin" && (
              <select
                value={collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                <option value="">All Colleges</option>
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
              <option value="inactive">Inactive</option>
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
                        try {
                          await Promise.all(
                            Array.from(selectedIds).map((id) => deleteStudentProfile(id))
                          );
                          toast.success(`Deleted ${selectedIds.size} student(s)`);
                          setSelectedIds(new Set());
                          
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
                            
                            if (result.data.length === 0 && currentPage > 1) {
                              setCurrentPage(currentPage - 1);
                            }
                          }
                        } catch (err) {
                          console.error("Failed to delete students:", err);
                          toast.error("Failed to delete some students");
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
                        className={`hover:bg-muted/20 transition-colors ${
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
                            <div>
                              <p className="font-bold text-foreground">{student.name}</p>
                              {student.rollNumber && (
                                <p className="text-[11px] text-muted-foreground">
                                  Roll: {student.rollNumber}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">{student.email}</td>
                        <td className="px-6 py-4 text-xs font-medium text-foreground">
                          {student.collegeName || "—"}
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
                                : student.status === "restricted"
                                ? "bg-rose-500/10 text-rose-600"
                                : "bg-gray-500/10 text-gray-600"
                            }`}
                          >
                            {student.status === "active"
                              ? "Active"
                              : student.status === "restricted"
                              ? "Restricted"
                              : "Inactive"}
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
                                onClick={() => setEditingStudent(student)}
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
