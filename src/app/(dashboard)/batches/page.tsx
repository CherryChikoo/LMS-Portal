"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Layers, Plus, Users, Trash2, ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { getDepartmentsForCollege, getYearsForDepartment } from "@/lib/hierarchy/hierarchy-data";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { createBatch, deleteBatch } from "@/lib/services";
import { getBatchesPaginatedAction } from "@/lib/actions/batch-actions";
import type { Batch } from "@/types";

function BatchesContent() {
  const searchParams = useSearchParams();
  const initialCollegeId = searchParams?.get("collegeId") || "";

  // ===== ALL HOOKS AT THE TOP (NUCLEAR SAFETY) =====
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("admin");
  const [userCollegeId, setUserCollegeId] = useState<string>("");
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const pageSize = 100;
  
  // Batches data
  const [batches, setBatches] = useState<any[]>([]);
  
  // Bulk delete state
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    hierarchy,
    filters: batchFilters,
    setFilters: setBatchFilters,
    institutionOptions,
    collegeOptions,
    departmentOptions,
    academicYearOptions,
  } = useAcademicHierarchy({
    initial: { collegeId: initialCollegeId },
    levels: userRole === "college_admin" ? ["department", "academicYear"] : ["institution", "department", "academicYear"],
  });
  
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [collegeId, setCollegeId] = useState(
    initialCollegeId || ""
  );
  const [department, setDepartment] = useState("Computer Science");
  const [academicYear, setAcademicYear] = useState("3rd Year");
  const [creating, setCreating] = useState(false);

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
      
      // If college admin, set collegeId for modal
      if (role.toLowerCase() === "college_admin" && colId) {
        setCollegeId(colId);
      }
    } catch (err) {
      console.error("Failed to load user data:", err);
    }
  }, []);

  // Set initial filters from URL
  useEffect(() => {
    if (initialCollegeId) {
      setBatchFilters({ collegeId: initialCollegeId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCollegeId]);

  // Load batches with pagination (GUARANTEED UNFREEZE via finally block)
  useEffect(() => {
    const loadBatches = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await getBatchesPaginatedAction({
          page: currentPage,
          pageSize,
          collegeId: batchFilters.collegeId,
          department: batchFilters.department,
          academicYear: batchFilters.academicYear,
          userRole,
          userCollegeId,
        });

        console.log('[BATCHES] Load result:', result);
        console.log('[BATCHES] First 3 batches:', result.data?.slice(0, 3));
        
        if (result.success) {
          console.log('[BATCHES] Setting batches:', result.data?.length, 'batches');
          console.log('[BATCHES] Batches state will be:', result.data);
          setBatches(result.data);
          setTotalCount(result.totalCount);
          setTotalPages(result.totalPages);
          
          // Log after state update (next tick)
          setTimeout(() => {
            console.log('[BATCHES] State updated - batches in state:', result.data?.length);
          }, 0);
        } else {
          console.error('[BATCHES] Error loading batches:', result.error);
          setError(result.error || "Failed to load batches");
          setBatches([]);
          setTotalCount(0);
          setTotalPages(0);
        }
      } catch (err) {
        console.error("Failed to load batches:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        setBatches([]);
        setTotalCount(0);
        setTotalPages(0);
      } finally {
        // NUCLEAR GUARANTEE: Always unfreeze the UI
        setLoading(false);
      }
    };

    loadBatches();
  }, [currentPage, batchFilters, userRole, userCollegeId]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [batchFilters.collegeId, batchFilters.department, batchFilters.academicYear]);

  // Debug: Log batches state changes
  useEffect(() => {
    console.log('[BATCHES] Batches state changed:', {
      length: batches.length,
      loading,
      error,
      firstBatch: batches[0],
    });
  }, [batches, loading, error]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setCreating(true);
    try {
      await createBatch({
        name,
        description,
        collegeId: userRole === "college_admin" && userCollegeId ? userCollegeId : (collegeId || "GLOBAL"),
        department,
        academicYear,
        studentIds: [],
        studentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setShowAddModal(false);
      setName("");
      setDescription("");
      // Reload current page
      setCurrentPage(1);
      const result = await getBatchesPaginatedAction({
        page: 1,
        pageSize,
        collegeId: batchFilters.collegeId,
        department: batchFilters.department,
        academicYear: batchFilters.academicYear,
        userRole,
        userCollegeId,
      });
      if (result.success) {
        setBatches(result.data);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
      }
    } catch (err) {
      console.error("Failed to create batch:", err);
      setError(err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Cohort Batch",
      message: "Are you sure you want to permanently delete this batch cohort? Enrolled students will remain intact.",
      onConfirm: async () => {
        try {
          await deleteBatch(id);
          // Reload current page
          const result = await getBatchesPaginatedAction({
            page: currentPage,
            pageSize,
            collegeId: batchFilters.collegeId,
            department: batchFilters.department,
            academicYear: batchFilters.academicYear,
            userRole,
            userCollegeId,
          });
          if (result.success) {
            setBatches(result.data);
            setTotalCount(result.totalCount);
            setTotalPages(result.totalPages);
          }
        } catch (err) {
          console.error("Failed to delete batch:", err);
          setError(err instanceof Error ? err.message : "Failed to delete batch");
        }
      }
    });
  };

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
  
  const toggleSelectBatch = (id: string) => {
    const newSelected = new Set(selectedBatchIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedBatchIds(newSelected);
  };
  
  const toggleSelectAll = () => {
    if (selectedBatchIds.size === batches.length) {
      // Deselect all
      setSelectedBatchIds(new Set());
    } else {
      // Select all on current page
      setSelectedBatchIds(new Set(batches.map(b => b.id)));
    }
  };
  
  const handleBulkDelete = () => {
    if (selectedBatchIds.size === 0) return;
    
    const selectedCount = selectedBatchIds.size;
    
    setConfirmConfig({
      isOpen: true,
      title: `Delete ${selectedCount} Batch${selectedCount > 1 ? 'es' : ''}`,
      message: `Are you sure you want to permanently delete ${selectedCount} batch cohort${selectedCount > 1 ? 's' : ''}? Enrolled students will remain intact. This operation cannot be undone.`,
      onConfirm: async () => {
        setIsDeleting(true);
        setError(null);
        
        try {
          const idsToDelete = Array.from(selectedBatchIds);
          let successCount = 0;
          let errorCount = 0;
          
          // Delete batches with error handling for each
          for (const id of idsToDelete) {
            try {
              await deleteBatch(id);
              successCount++;
            } catch (err: any) {
              // P2025 = record not found, skip silently
              if (err?.code === 'P2025') {
                console.warn(`Batch ${id} not found, skipping`);
                successCount++; // Count as success since it's already gone
              } else {
                console.error(`Failed to delete batch ${id}:`, err);
                errorCount++;
              }
            }
          }
          
          // Clear selection
          setSelectedBatchIds(new Set());
          
          // Show result message
          if (errorCount > 0) {
            setError(`Deleted ${successCount} batches, ${errorCount} failed. Refreshing list...`);
          }
          
          // Reload current page
          const result = await getBatchesPaginatedAction({
            page: currentPage,
            pageSize,
            collegeId: batchFilters.collegeId,
            department: batchFilters.department,
            academicYear: batchFilters.academicYear,
            userRole,
            userCollegeId,
          });
          
          if (result.success) {
            setBatches(result.data);
            setTotalCount(result.totalCount);
            setTotalPages(result.totalPages);
            
            // If current page is now empty and it's not page 1, go to previous page
            if (result.data.length === 0 && currentPage > 1) {
              setCurrentPage(currentPage - 1);
            }
          }
        } catch (err) {
          console.error("Failed to delete batches:", err);
          setError(err instanceof Error ? err.message : "Failed to delete batches");
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Custom Batches & Student Cohorts"
        description={
          userRole === "student"
            ? "Batches and cohorts you are currently enrolled in."
            : "Create custom training cohorts, placement batches, or global elective squads to group students across departments or colleges."
        }
        actions={
          userRole !== "student" ? (
            <Button onClick={() => setShowAddModal(true)} className="bg-brand hover:bg-brand/90 text-brand-foreground font-bold">
              <Plus className="w-4 h-4 mr-1.5" />
              Create Custom Batch
            </Button>
          ) : undefined
        }
      />

      {/* Cascading Hierarchy Filter Bar */}
      {userRole !== "student" && (
        <div className="space-y-4">
          <AcademicHierarchyFilters
            levels={userRole === "college_admin" ? ["department", "academicYear"] : ["institution", "department", "academicYear"]}
            filters={batchFilters}
            onChange={setBatchFilters}
            showInstitution={userRole !== "college_admin"}
            institutionOptions={institutionOptions}
            collegeOptions={collegeOptions}
            departmentOptions={departmentOptions}
            academicYearOptions={academicYearOptions}
            sectionOptions={[]}
            batchOptions={[]}
            studentOptions={[]}
          />
          
          {/* Bulk Actions Bar */}
          {batches.length > 0 && (
            <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedBatchIds.size === batches.length && batches.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border bg-background text-brand focus:ring-brand/50 cursor-pointer"
                />
                <span className="text-sm font-medium text-foreground">
                  {selectedBatchIds.size === 0 
                    ? "Select All" 
                    : `${selectedBatchIds.size} selected`}
                </span>
              </div>
              
              {selectedBatchIds.size > 0 && (
                <Button
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isDeleting ? "Deleting..." : `Delete ${selectedBatchIds.size}`}
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
              <h3 className="text-lg font-semibold text-destructive mb-1">Failed to Load Batches</h3>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-card/40 border border-border" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={userRole === "student" ? "No enrolled batches found" : "No batches found"}
          description={
            userRole === "student"
              ? "You are not currently enrolled in any batch cohort. Contact your trainer if you believe this is incorrect."
              : "Create custom cohorts like Placement Batch 2026 or Advanced React Bootcamp to easily group students."
          }
          actionLabel={userRole !== "student" ? "Create Your First Batch" : undefined}
          onAction={userRole !== "student" ? () => setShowAddModal(true) : undefined}
        />
      ) : (
        <>
          {/* Batches Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {batches.map((b: any) => {
              const isSelected = selectedBatchIds.has(b.id);
              return (
                <motion.div
                  key={b.id}
                  whileHover={{ y: -4 }}
                  className={`group relative rounded-xl border bg-card p-6 flex flex-col justify-between gap-6 shadow-sm hover:border-brand/40 transition-all duration-300 ${
                    isSelected ? 'border-brand ring-2 ring-brand/20' : 'border-border'
                  }`}
                >
                  {/* Selection Checkbox */}
                  {userRole !== "student" && (
                    <div className="absolute top-4 left-4 z-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelectBatch(b.id);
                        }}
                        className="w-4 h-4 rounded border-border bg-background text-brand focus:ring-brand/50 cursor-pointer"
                      />
                    </div>
                  )}
                  
                  <div className="space-y-2 pl-8">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-xl font-extrabold text-foreground break-words leading-tight group-hover:text-brand transition-colors">
                        {b.name}
                      </h3>
                      {userRole !== "student" && (
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
                          title="Delete Batch"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {b.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {b.description}
                      </p>
                    )}
                    {b.collegeName && (
                      <p className="text-xs font-semibold text-brand">
                        {b.collegeName}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-border/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
                        <Users className="w-4 h-4 text-brand" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-extrabold text-foreground text-sm leading-none">
                          {(b.studentCount || 0).toLocaleString()}
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">Students</span>
                      </div>
                    </div>

                    {userRole !== "student" && (
                      <Link
                        href={`/admin/batches/${b.id}`}
                        className="text-brand font-bold flex items-center gap-1 hover:bg-brand/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Manage <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-6">
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-bold text-foreground">{(currentPage - 1) * pageSize + 1}</span> - <span className="font-bold text-foreground">{Math.min(currentPage * pageSize, totalCount)}</span> of <span className="font-bold text-foreground">{totalCount.toLocaleString()}</span> Batches
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

      {/* Create Batch Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Create New Batch</h3>
                <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Batch Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. TCS Placement Cohort 2026"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Assign to Scope / Institution</label>
                  {userRole === "college_admin" && userCollegeId ? (
                    <div className="w-full h-10 px-3 rounded-xl border border-border bg-secondary/50 text-sm text-foreground flex items-center font-medium">
                      {institutionOptions.find(o => o.value === userCollegeId)?.label || "My College"}
                    </div>
                  ) : (
                    <select
                      value={collegeId}
                      onChange={(e) => {
                        setCollegeId(e.target.value);
                        setDepartment("");
                        setAcademicYear("");
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                    >
                      <option value="GLOBAL">Global Custom Batch (All Institutions)</option>
                      {institutionOptions
                        .filter((o) => o.value !== "" && o.value !== "GLOBAL")
                        .map((i) => (
                          <option key={i.value} value={i.value}>
                            {i.label}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Department</label>
                    <select
                      value={department}
                      onChange={(e) => {
                        setDepartment(e.target.value);
                        setAcademicYear("");
                      }}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                    >
                      <option value="">All Departments</option>
                      {(hierarchy ? getDepartmentsForCollege(hierarchy, collegeId) : []).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Academic Year</label>
                    <select
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                    >
                      <option value="">All Years</option>
                      {(hierarchy ? getYearsForDepartment(hierarchy, collegeId, department) : []).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Description (Optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Intensive problem solving and technical interview prep."
                    className="w-full p-3 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-brand text-brand-foreground hover:bg-brand/90">
                    {creating ? "Creating..." : "Save Batch"}
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
        confirmText="Delete"
        variant="destructive"
      />

      {/* Loading Overlay for Bulk Delete */}
      <AnimatePresence>
        {isDeleting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            style={{ pointerEvents: 'all' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6 max-w-md w-full mx-4"
            >
              {/* Spinner */}
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-brand/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-brand border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
              </div>

              {/* Text */}
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-foreground">
                  Deleting Batches
                </h3>
                <p className="text-sm text-muted-foreground">
                  Deleting {selectedBatchIds.size} batch{selectedBatchIds.size > 1 ? 'es' : ''}...
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Please wait, this may take a moment
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function BatchesPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-muted-foreground animate-pulse">Loading batches and student cohorts...</div>}>
      <BatchesContent />
    </Suspense>
  );
}
