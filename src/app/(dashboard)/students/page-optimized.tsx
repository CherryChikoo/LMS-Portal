"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Users, Plus, Upload, Download, Search, Trash2, Edit2, Ban, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useDebounce } from "@/hooks/use-debounce";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { toast } from "sonner";
import { useInfiniteStudents } from "@/hooks/use-infinite-students";
import { VirtualizedStudentTable } from "@/components/data-tables/virtualized-student-table";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";
import { deleteStudentProfile, updateStudentProfile, formatAuthError } from "@/lib/services";
import type { Student } from "@/types";

export default function StudentsPageOptimized() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const initialCollegeId = searchParams.get("collegeId") || "";
  const initialBatchId = searchParams.get("batchId") || "";

  // Get user role from localStorage (client-side only)
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

  // Get metadata from cache (for filter options)
  const colleges = useLMSDataSelector((s) => s.filteredColleges);
  const batches = useLMSDataSelector((s) => s.filteredBatches);

  // Filter state
  const [searchRaw, setSearchRaw] = useState("");
  const debouncedSearch = useDebounce(searchRaw, 400); // Debounce search input
  const [collegeFilter, setCollegeFilter] = useState(initialCollegeId);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState(initialBatchId);
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState<"ALL" | "RECENT_24H" | "RECENT_7D" | "CSV" | "MANUAL" | "SELF">("ALL");

  // Build server-side filters
  const serverFilters: StudentFilters = useMemo(() => {
    const filters: StudentFilters = {
      timeFilter,
    };

    if (debouncedSearch) filters.search = debouncedSearch;
    if (collegeFilter && collegeFilter !== "ALL") filters.collegeId = collegeFilter;
    if (departmentFilter && departmentFilter !== "ALL") filters.department = departmentFilter;
    if (yearFilter && yearFilter !== "ALL") filters.academicYear = yearFilter;
    if (sectionFilter && sectionFilter !== "ALL") filters.section = sectionFilter;
    if (batchFilter && batchFilter !== "ALL") filters.batchId = batchFilter;
    if (statusFilter && statusFilter !== "ALL") filters.status = statusFilter;

    return filters;
  }, [debouncedSearch, collegeFilter, departmentFilter, yearFilter, sectionFilter, batchFilter, statusFilter, timeFilter]);

  // Use infinite scroll hook with server-side filtering
  const {
    students,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useInfiniteStudents(serverFilters);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
    isAlert?: boolean;
    variant?: "destructive" | "warning" | "info" | "success";
  } | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const handleDeleteStudent = (student: Student) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Student Account",
      message: `This will permanently remove ${student.name} (${student.email}) from the system.`,
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteStudentProfile(student.id);
          toast.success(`Student profile deleted.`);
          refresh(); // Refresh the list
        } catch (err) {
          console.error("Failed to delete student:", err);
          toast.error(formatAuthError(err));
        }
      },
    });
  };

  const handleToggleStatus = (student: Student) => {
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
          refresh(); // Refresh the list
        } catch (err) {
          console.error("Failed to update status:", err);
          toast.error(formatAuthError(err));
        }
      },
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    
    setConfirmConfig({
      isOpen: true,
      title: "Delete Selected Students",
      message: `This will permanently delete ${selectedIds.length} student account(s).`,
      variant: "destructive",
      onConfirm: async () => {
        try {
          await Promise.all(selectedIds.map((id) => deleteStudentProfile(id)));
          toast.success(`Deleted ${selectedIds.length} student account(s).`);
          setSelectedIds([]);
          refresh();
        } catch (err) {
          console.error("Failed to delete selected students:", err);
          toast.error(formatAuthError(err));
        }
      },
    });
  };

  // Department options (extracted from students)
  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    colleges.forEach(c => {
      if (c.departments && Array.isArray(c.departments)) {
        c.departments.forEach((d: string) => depts.add(d));
      }
    });
    return Array.from(depts).sort();
  }, [colleges]);

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Students & Enrollment"
        description="Manage student accounts and enrollment"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-brand hover:bg-brand/90 text-brand-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Student
            </Button>
            <Button
              onClick={() => setShowImportModal(true)}
              variant="outline"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
          </div>
        }
      />

      {/* Filters */}
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* College filter */}
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
            <option value="1st Year">1st Year</option>
            <option value="2nd Year">2nd Year</option>
            <option value="3rd Year">3rd Year</option>
            <option value="4th Year">4th Year</option>
          </select>

          {/* Section filter */}
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <option value="">All Sections</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
            <option value="C">Section C</option>
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

          {/* Time filter */}
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as any)}
            className="h-10 px-3 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <option value="ALL">All Time</option>
            <option value="RECENT_24H">Last 24 Hours</option>
            <option value="RECENT_7D">Last 7 Days</option>
            <option value="CSV">CSV Imports</option>
            <option value="MANUAL">Manual Entry</option>
          </select>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div className="text-sm font-medium text-muted-foreground">
            Showing <span className="text-foreground font-bold">{students.length}</span> of{" "}
            <span className="text-foreground font-bold">{total.toLocaleString()}</span> students
          </div>
          {hasMore && (
            <Button
              size="sm"
              variant="outline"
              onClick={loadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load More"}
            </Button>
          )}
        </div>
      </div>

      {/* Selected actions */}
      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between"
        >
          <span className="text-sm font-medium">
            {selectedIds.length} student(s) selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>
              Deselect All
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDeleteSelected}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </motion.div>
      )}

      {/* Students list */}
      {isLoading && students.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-8 h-8 mx-auto rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="mt-4 text-sm text-muted-foreground">Loading students...</p>
        </div>
      ) : error ? (
        <div className="p-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button onClick={refresh} className="mt-4">
            Try Again
          </Button>
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description="Try adjusting your filters or add new students."
          actionLabel="Add Student"
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <VirtualizedStudentTable
          students={students}
          isLoadingMore={isLoadingMore}
          loadProgress={total > 0 ? (students.length / total) * 100 : 100}
          onDelete={handleDeleteStudent as any}
          onToggleStatus={handleToggleStatus as any}
          onEdit={(student) => setEditingStudent(student as any)}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}

      {/* Infinite scroll trigger */}
      {hasMore && !isLoading && !isLoadingMore && students.length > 0 && (
        <div className="text-center py-4">
          <Button
            variant="outline"
            onClick={loadMore}
            className="w-full max-w-md"
          >
            Load More Students ({students.length} / {total.toLocaleString()})
          </Button>
        </div>
      )}

      {/* Confirm modal */}
      {confirmConfig && (
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          onClose={() => setConfirmConfig(null)}
          onConfirm={confirmConfig.onConfirm || (() => {})}
          title={confirmConfig.title}
          message={confirmConfig.message}
          variant={confirmConfig.variant}
          isAlert={confirmConfig.isAlert}
        />
      )}
    </motion.div>
  );
}
