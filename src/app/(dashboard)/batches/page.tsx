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
import { getAllBatches, createBatch, deleteBatch } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import type { Batch } from "@/types";

function BatchesContent() {
  const searchParams = useSearchParams();
  const initialCollegeId = searchParams?.get("collegeId") || "";

  const [batches, setBatches] = useState<Batch[]>([]);
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

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [collegeId, setCollegeId] = useState(initialCollegeId);
  const [department, setDepartment] = useState("Computer Science");
  const [academicYear, setAcademicYear] = useState("3rd Year");
  const [creating, setCreating] = useState(false);

  const fetchData = async (studentUser?: { uid: string; email: string; profile?: Record<string, unknown> } | null) => {
    setLoading(true);
    try {
      const bData = await getAllBatches();
      const sData = hierarchy?.students || [];
      const computedBatches = bData.map((b) => ({
        ...b,
        studentCount: sData.filter((s) => s.batchIds && (s.batchIds.includes(b.id) || s.batchIds.includes(b.name))).length,
      }));

      const role = (typeof window !== "undefined" && localStorage.getItem("lms_role")) || "admin";
      const isStudentView = role.toLowerCase() === "student";

      if (isStudentView && studentUser) {
        const uid = studentUser.uid.toLowerCase().trim();
        const email = studentUser.email.toLowerCase().trim();
        const profileBatchIds = new Set(((studentUser.profile?.batchIds as string[]) || []).map((x) => x.toLowerCase()));
        const meStudent = sData.find(
          (s) =>
            s.id.toLowerCase() === uid ||
            s.email.toLowerCase() === email
        );
        const enrolledBatchIds = new Set([
          ...Array.from(profileBatchIds),
          ...((meStudent?.batchIds || []).map((x) => x.toLowerCase())),
        ]);

        const visibleBatches = computedBatches.filter((b) => {
          const batchStudentIds = (b.studentIds || []).map((x) => x.toLowerCase());
          if (batchStudentIds.includes(uid) || (email && batchStudentIds.includes(email))) return true;
          if (enrolledBatchIds.has(b.id.toLowerCase()) || enrolledBatchIds.has(b.name.toLowerCase())) return true;
          return false;
        });
        setBatches(visibleBatches);
      } else if (role.toLowerCase() === "college_admin") {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        let parsed: any = {};
        try { parsed = JSON.parse(uStr || "{}"); } catch (_) {}
        if (parsed.collegeId) {
          const myStudents = sData.filter((s) => s.collegeId === parsed.collegeId);
          const validStudentBatchIds = new Set(myStudents.flatMap((s) => s.batchIds || []));
          setBatches(computedBatches.filter(b => b.collegeId === parsed.collegeId || validStudentBatchIds.has(b.id)));
        } else {
          setBatches(computedBatches);
        }
      } else {
        setBatches(computedBatches);
      }

    } catch (err) {
      console.error("Error fetching batches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const role = (typeof window !== "undefined" && localStorage.getItem("lms_role")) || "admin";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading initial role from localStorage
    setUserRole(role.toLowerCase());
    if (role.toLowerCase() === "student") {
      getCurrentUser().then((u) => {
        if (u) {
          setCurrentStudent({ uid: u.uid, email: u.email, profile: u.profile });
          fetchData({ uid: u.uid, email: u.email, profile: u.profile });
        } else {
          fetchData(null);
        }
      });
    } else {
      fetchData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial mount only
  }, []);

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
        collegeId: collegeId || "GLOBAL",
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
      fetchData(currentStudent);
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
          fetchData(currentStudent);
        } catch (err) {
          console.error("Failed to delete batch:", err);
        }
      }
    });
  };

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (batchFilters.collegeId && b.collegeId !== batchFilters.collegeId) return false;
      if (batchFilters.department && b.department !== batchFilters.department) return false;
      if (batchFilters.academicYear && b.academicYear !== batchFilters.academicYear) return false;
      return true;
    });
  }, [batches, batchFilters]);

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
          {filteredBatches.map((b) => {
            const colName = hierarchy?.collegeMap.get(b.collegeId || "")?.name || "General Institute";
            return (
              <motion.div
                key={b.id}
                whileHover={{ y: -4 }}
                className="rounded-xl border border-border bg-card p-6 flex flex-col justify-between space-y-5 shadow-sm relative group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-brand">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{colName}</span>
                    </div>
                    {userRole !== "student" && (
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        title="Delete Batch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-foreground break-words leading-tight">{b.name}</h3>
                  {b.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-secondary border border-border space-y-2 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Department:</span>
                    <span className="font-semibold text-foreground">{b.department || "General"}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Academic Year:</span>
                    <span className="font-semibold text-foreground">{b.academicYear || "All Years"}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-brand" />
                    <span className="font-semibold text-foreground">{b.studentCount || 0} Students Enrolled</span>
                  </span>
                  {userRole !== "student" && (
                    <Link
                      href={`/batches/${b.id}`}
                      className="text-brand font-semibold flex items-center gap-0.5 hover:underline cursor-pointer"
                    >
                      Manage Students <ChevronRight className="w-3.5 h-3.5" />
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
