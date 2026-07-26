"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Layers, Plus, Users, Trash2, Building2, ChevronRight } from "lucide-react";
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
import { getCurrentUser } from "@/lib/utils/auth-session";
import { useLMSData } from "@/lib/data/use-lms-data";
import type { Batch } from "@/types";

function BatchesContent() {
  const searchParams = useSearchParams();
  const initialCollegeId = searchParams?.get("collegeId") || "";

  const { filteredBatches: cacheBatches, loading: lmsLoading } = useLMSData();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("admin");

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
    levels: ["institution", "department", "academicYear"],
  });
  const [currentStudent, setCurrentStudent] = useState<{ uid: string; email: string; profile?: Record<string, unknown> } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // Detect user's own college for scoping
  const userCollegeId = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const profile = uStr ? JSON.parse(uStr) : {};
      return profile.collegeId || "";
    } catch { return ""; }
  }, []);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [collegeId, setCollegeId] = useState(
    initialCollegeId || (userRole === "college_admin" && userCollegeId ? userCollegeId : "")
  );
  const [department, setDepartment] = useState("Computer Science");
  const [academicYear, setAcademicYear] = useState("3rd Year");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const role = (typeof window !== "undefined" && localStorage.getItem("lms_role")) || "admin";
    setUserRole(role.toLowerCase());
    if (role.toLowerCase() === "student") {
      getCurrentUser().then((u) => {
        if (u) {
          setCurrentStudent({ uid: u.uid, email: u.email, profile: u.profile });
        }
      });
    }
  }, []);

  useEffect(() => {
    setLoading(lmsLoading);
  }, [lmsLoading]);

  useEffect(() => {
    if (initialCollegeId) {
      setBatchFilters({ collegeId: initialCollegeId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL param only
  }, [initialCollegeId]);

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
      // Data is synced by useLMSData
    } catch (err) {
      console.error("Failed to create batch:", err);
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
          // Data is synced by useLMSData
        } catch (err) {
          console.error("Failed to delete batch:", err);
        }
      }
    });
  };

  const filteredBatches = useMemo(() => {
    return (cacheBatches as Batch[]).filter((b: Batch) => {
      if (b.isDeleted) return false;
      if (batchFilters.collegeId && b.collegeId !== batchFilters.collegeId) return false;
      if (batchFilters.department && b.department !== batchFilters.department) return false;
      if (batchFilters.academicYear && b.academicYear !== batchFilters.academicYear) return false;
      return true;
    });
  }, [cacheBatches, batchFilters]);

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
        <AcademicHierarchyFilters
          levels={["institution", "department", "academicYear"]}
          filters={batchFilters}
          onChange={setBatchFilters}
          showInstitution
          institutionOptions={institutionOptions}
          collegeOptions={collegeOptions}
          departmentOptions={departmentOptions}
          academicYearOptions={academicYearOptions}
          sectionOptions={[]}
          batchOptions={[]}
          studentOptions={[]}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-card/40 border border-border" />
          ))}
        </div>
      ) : filteredBatches.length === 0 ? (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBatches.map((b: Batch) => {
            return (
              <motion.div
                key={b.id}
                whileHover={{ y: -4 }}
                className="group relative rounded-xl border border-border bg-card p-6 flex flex-col justify-between gap-6 shadow-sm hover:border-brand/40 transition-all duration-300"
              >
                <div className="space-y-2">
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
                </div>

                <div className="pt-4 border-t border-border/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
                      <Users className="w-4 h-4 text-brand" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-extrabold text-foreground text-sm leading-none">{b.studentCount || 0}</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">Students</span>
                    </div>
                  </div>

                  {userRole !== "student" && (
                    <Link
                      href={`/batches/${b.id}`}
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
                    /* College admins are locked to their own college */
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
