"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, BookOpen, Users, Trash2, Search, Building2, UserPlus, Ban, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { uniqueOptions } from "@/lib/utils/array";
import { getBatchById, updateBatch, getAllStudents, updateStudentProfile, getAllColleges } from "@/lib/services";
import type { Batch, Student, College } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function BatchDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; confirmText?: string; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);

  // Search and Filters for enrolled students
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state for adding existing students
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [selectedCollegeFilter, setSelectedCollegeFilter] = useState("ALL");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("ALL");
  const [selectedYearFilter, setSelectedYearFilter] = useState("ALL");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState("ALL");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [batData, studentsData, colsData] = await Promise.all([
          getBatchById(resolvedParams.id),
          getAllStudents(),
          getAllColleges(),
        ]);

        setBatch(batData);
        setAllStudents(studentsData);
        setColleges(colsData);
      } catch (err) {
        console.error("Error loading batch details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [resolvedParams.id]);

  // Cascading filter option lists for the "Add Students" modal.
  // Hooks must run unconditionally, so they live above any early returns below.
  const filteredStudentsByCollege = useMemo(
    () =>
      selectedCollegeFilter === "ALL"
        ? allStudents
        : allStudents.filter(
            (s) => s.collegeId === selectedCollegeFilter || s.collegeName === selectedCollegeFilter
          ),
    [allStudents, selectedCollegeFilter]
  );

  const deptsList = useMemo(() => {
    const base = filteredStudentsByCollege.map((s) => s.department);
    if (selectedCollegeFilter === "ALL") {
      base.push(...colleges.flatMap((c) => c.departments || []));
    }
    return uniqueOptions(base.filter(Boolean));
  }, [filteredStudentsByCollege, colleges, selectedCollegeFilter]);

  const yearsList = useMemo(() => {
    const base = filteredStudentsByCollege.map((s) => s.academicYear);
    if (selectedCollegeFilter === "ALL") base.push("1st Year", "2nd Year", "3rd Year", "4th Year");
    return uniqueOptions(base.filter(Boolean));
  }, [filteredStudentsByCollege, selectedCollegeFilter]);

  const sectionsList = useMemo(() => {
    const base = filteredStudentsByCollege.map((s) => s.section);
    if (selectedCollegeFilter === "ALL") base.push("A", "B", "C", "D");
    return uniqueOptions(base.filter(Boolean));
  }, [filteredStudentsByCollege, selectedCollegeFilter]);

  // Reset child filters when the parent College selection (or the option lists) makes them invalid.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cascading reset: child filters must reset when the parent filter narrows the available options
    if (selectedDeptFilter !== "ALL" && !deptsList.includes(selectedDeptFilter)) setSelectedDeptFilter("ALL");
    if (selectedYearFilter !== "ALL" && !yearsList.includes(selectedYearFilter)) setSelectedYearFilter("ALL");
    if (selectedSectionFilter !== "ALL" && !sectionsList.includes(selectedSectionFilter)) setSelectedSectionFilter("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally exclude selected* values so the reset only fires when the parent filter narrows the option list
  }, [selectedCollegeFilter, deptsList, yearsList, sectionsList]);

  if (loading) {
    return (
      <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading custom batch cohort hub...</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="space-y-6">
        <Link href="/batches" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Custom Batches
        </Link>
        <EmptyState
          icon={BookOpen}
          title="Batch Not Found"
          description="The requested custom batch or cohort could not be located."
          actionLabel="Return to Batches"
          onAction={() => window.location.assign("/batches")}
        />
      </div>
    );
  }

  // Students currently enrolled in this batch
  const enrolledStudents = allStudents.filter((s) => {
    if (!s.batchIds) return false;
    return s.batchIds.includes(batch.id) || s.batchIds.includes(batch.name);
  });

  const filteredEnrolled = enrolledStudents.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.rollNumber && s.rollNumber.toLowerCase().includes(q))
    );
  });

  // Students not yet in this batch (available to be added) — with all filters
  const availableStudents = allStudents.filter((s) => {
    const alreadyIn = s.batchIds && (s.batchIds.includes(batch.id) || s.batchIds.includes(batch.name));
    if (alreadyIn) return false;

    const matchesCol = selectedCollegeFilter === "ALL" || s.collegeId === selectedCollegeFilter || s.collegeName === selectedCollegeFilter;
    const matchesDept = selectedDeptFilter === "ALL" || s.department === selectedDeptFilter;
    const matchesYear = selectedYearFilter === "ALL" || s.academicYear === selectedYearFilter;
    const matchesSection = selectedSectionFilter === "ALL" || s.section === selectedSectionFilter;
    const q = modalSearch.toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.rollNumber && s.rollNumber.toLowerCase().includes(q));

    return matchesCol && matchesDept && matchesSearch && matchesYear && matchesSection;
  });

  // Only count selected students that are currently visible and available
  const validSelectedStudents = availableStudents.filter((s) => selectedForBulk.has(s.id));

  const handleAddStudentToBatch = async (student: Student) => {
    setAddingId(student.id);
    try {
      const currentBatches = student.batchIds || [];
      const updatedBatches = Array.from(new Set([...currentBatches, batch.id, batch.name]));
      await updateStudentProfile(student.id, { batchIds: updatedBatches });
      await updateBatch(batch.id, { studentCount: enrolledStudents.length + 1 });

      // Locally update state for fast feedback
      setAllStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, batchIds: updatedBatches } : s))
      );
      setSelectedForBulk((prev) => {
        const next = new Set(prev);
        next.delete(student.id);
        return next;
      });
    } catch (err) {
      console.error("Failed to add student to batch:", err);
      setConfirmConfig({
        isOpen: true,
        title: "Enrollment Failed",
        message: `Failed to add "${student.name}" to batch. Please try again.`,
        variant: "warning"
      });
    } finally {
      setAddingId(null);
    }
  };

  const handleBulkAddToBatch = () => {
    const studentsToAdd = validSelectedStudents;
    if (studentsToAdd.length === 0 || !batch) return;
    setConfirmConfig({
      isOpen: true,
      title: "Enroll Students in Batch",
      message: `Are you sure you want to enroll ${studentsToAdd.length} selected student(s) into batch "${batch.name}"?`,
      confirmText: "Enroll Students",
      variant: "info",
      onConfirm: async () => {
        setBulkAdding(true);
        try {
          for (const student of studentsToAdd) {
            const currentBatches = student.batchIds || [];
            const updatedBatches = Array.from(new Set([...currentBatches, batch.id, batch.name]));
            await updateStudentProfile(student.id, { batchIds: updatedBatches });
          }
          await updateBatch(batch.id, { studentCount: enrolledStudents.length + studentsToAdd.length });
          setAllStudents((prev) =>
            prev.map((s) =>
              selectedForBulk.has(s.id) ? { ...s, batchIds: Array.from(new Set([...(s.batchIds || []), batch.id, batch.name])) } : s
            )
          );
          setSelectedForBulk(new Set());
        } catch (err) {
          console.error("Bulk add failed:", err);
          setConfirmConfig({
            isOpen: true,
            title: "Enrollment Failed",
            message: "Failed to enroll some or all selected students into the batch. Please try again.",
            variant: "warning"
          });
        } finally {
          setBulkAdding(false);
        }
      }
    });
  };

  const toggleSelectAll = () => {
    if (validSelectedStudents.length === availableStudents.length && availableStudents.length > 0) {
      setSelectedForBulk((prev) => {
        const next = new Set(prev);
        availableStudents.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedForBulk((prev) => {
        const next = new Set(prev);
        availableStudents.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const toggleStudentSelection = (id: string) => {
    setSelectedForBulk((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleStatus = (stud: Student) => {
    const isRestricted = stud.status === "restricted";
    const newStatus = isRestricted ? "active" : "restricted";

    if (!isRestricted) {
      setConfirmConfig({
        isOpen: true,
        title: "Restrict Student Account",
        message: `Are you sure you want to restrict "${stud.name}"'s account? The student will not be able to log in until the account is reactivated.`,
        confirmText: "Restrict",
        variant: "warning",
        onConfirm: async () => {
          try {
            await updateStudentProfile(stud.id, { status: newStatus });
            setAllStudents((prev) =>
              prev.map((s) => (s.id === stud.id ? { ...s, status: newStatus } : s))
            );
          } catch (err) {
            console.error("Failed to restrict account:", err);
          }
        }
      });
    } else {
      setConfirmConfig({
        isOpen: true,
        title: "Reactivate Student Account",
        message: `Are you sure you want to reactivate "${stud.name}"'s account? They will immediately regain access to the LMS.`,
        confirmText: "Reactivate",
        variant: "info",
        onConfirm: async () => {
          try {
            await updateStudentProfile(stud.id, { status: newStatus });
            setAllStudents((prev) =>
              prev.map((s) => (s.id === stud.id ? { ...s, status: newStatus } : s))
            );
          } catch (err) {
            console.error("Failed to reactivate account:", err);
          }
        }
      });
    }
  };

  const handleRemoveFromBatch = (student: Student) => {
    if (!batch) return;
    setConfirmConfig({
      isOpen: true,
      title: "Remove Student from Batch",
      message: `Are you sure you want to remove ${student.name} from batch "${batch.name}"?`,
      confirmText: "Remove",
      variant: "destructive",
      onConfirm: async () => {
        setRemovingId(student.id);
        try {
          const currentBatches = student.batchIds || [];
          const updatedBatches = currentBatches.filter((b) => b !== batch.id && b !== batch.name);
          await updateStudentProfile(student.id, { batchIds: updatedBatches });
          await updateBatch(batch.id, { studentCount: Math.max(0, enrolledStudents.length - 1) });

          setAllStudents((prev) =>
            prev.map((s) => (s.id === student.id ? { ...s, batchIds: updatedBatches } : s))
          );
        } catch (err) {
          console.error("Failed to remove student from batch:", err);
        } finally {
          setRemovingId(null);
        }
      }
    });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href="/batches"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to All Batches
          </Link>
          <PageHeader
            title={`${batch.name}`}
            description={batch.description || "Manage student enrollment and cohort roster for tests and resource sharing."}
          />
        </div>

        <Button onClick={() => setShowAddModal(true)} className="gap-2 bg-brand hover:bg-brand/90 text-brand-foreground shadow-lg shadow-brand/20">
          <UserPlus className="w-4 h-4" /> Add Students from Colleges
        </Button>
      </div>

      {/* Cohort Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Enrolled</p>
            <p className="text-2xl font-black text-foreground">{enrolledStudents.length} Students</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Level</p>
            <p className="text-sm font-bold text-foreground truncate">{batch.collegeId === "GLOBAL" ? "Global Cohort" : batch.collegeId}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Academic Year</p>
            <p className="text-sm font-bold text-foreground">{batch.academicYear || "All Years"}</p>
          </div>
        </div>
      </div>

      {/* Search Bar for Enrolled Students */}
      <div className="flex items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search enrolled students by name, email or roll..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm font-medium focus:outline-none focus:border-brand"
          />
        </div>
        <div className="text-xs font-semibold text-muted-foreground">
          Showing <span className="text-foreground">{filteredEnrolled.length}</span> of {enrolledStudents.length} cohort members
        </div>
      </div>

      {/* Enrolled Students Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {filteredEnrolled.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3.5 px-4">Student Name & Email</th>
                  <th className="py-3.5 px-4">Roll Number</th>
                  <th className="py-3.5 px-4">College</th>
                  <th className="py-3.5 px-4">Department & Year</th>
                  <th className="py-3.5 px-4">Section</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredEnrolled.map((stud) => (
                  <tr key={stud.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-foreground text-sm">{stud.name}</div>
                      <div className="text-muted-foreground">{stud.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-foreground">{stud.rollNumber || "—"}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-lg bg-accent/60 text-foreground font-semibold">
                        {stud.collegeName || stud.collegeId}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-foreground">{stud.department}</div>
                      <div className="text-muted-foreground text-[11px]">{stud.academicYear}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-brand/10 text-brand font-bold">Sec {stud.section || "A"}</span>
                    </td>
                    <td className="py-3 px-4">
                      {stud.status === "restricted" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          Restricted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {stud.status === "restricted" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(stud)}
                            className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-lg"
                            title="Reactivate Account"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(stud)}
                            className="h-8 w-8 p-0 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 rounded-lg"
                            title="Restrict Account"
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removingId === stud.id}
                          onClick={() => handleRemoveFromBatch(stud)}
                          className="h-8 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          title="Remove student from this batch"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No Students in Cohort"
            description="Click 'Add Students from Colleges' above to enroll existing students into this batch."
            actionLabel="Add Students"
            onAction={() => setShowAddModal(true)}
          />
        )}
      </div>

      {/* Add Existing Students Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-card rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Enroll Existing Students into {batch.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select students from your existing college database to assign them to this batch for tests & resource sharing.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)} className="rounded-xl">
                  Done
                </Button>
              </div>

              {/* Filters & Search */}
              <div className="p-4 border-b border-border bg-background space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                  <div className="relative md:col-span-2">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search by name, email or roll..."
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-xl bg-card border border-border text-xs focus:outline-none focus:border-brand"
                    />
                  </div>

                  <select
                    value={selectedCollegeFilter}
                    onChange={(e) => setSelectedCollegeFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-semibold text-foreground"
                  >
                    <option value="ALL">All Colleges</option>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.name}>{c.name || "Unnamed College"}</option>
                    ))}
                  </select>

                  <select
                    value={selectedDeptFilter}
                    onChange={(e) => setSelectedDeptFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-semibold text-foreground"
                  >
                    <option value="ALL">All Departments</option>
                    {deptsList.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedYearFilter}
                    onChange={(e) => setSelectedYearFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-semibold text-foreground"
                  >
                    <option value="ALL">All Years</option>
                    {yearsList.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedSectionFilter}
                      onChange={(e) => setSelectedSectionFilter(e.target.value)}
                      className="h-8 px-2 rounded-lg bg-card border border-border text-xs font-semibold text-foreground"
                    >
                      <option value="ALL">All Sections</option>
                      {sectionsList.map((sec) => (
                        <option key={sec} value={sec}>
                          Section {sec}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={availableStudents.length > 0 && validSelectedStudents.length === availableStudents.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-border text-brand focus:ring-brand accent-[var(--color-brand)]"
                      />
                      <span className="text-xs font-bold text-foreground">
                        Select All ({availableStudents.length})
                      </span>
                    </label>
                  </div>

                  {validSelectedStudents.length > 0 && (
                    <Button
                      size="sm"
                      disabled={bulkAdding}
                      onClick={handleBulkAddToBatch}
                      className="h-8 px-4 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground text-xs font-bold gap-1.5 shadow-lg shadow-brand/20"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {bulkAdding
                        ? "Adding..."
                        : `Add ${validSelectedStudents.length} Selected to Batch`}
                    </Button>
                  )}
                </div>
              </div>

              {/* Available Students List */}
              <div className="p-6 overflow-y-auto flex-1 space-y-2">
                {availableStudents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {availableStudents.map((stud) => (
                      <div
                        key={stud.id}
                        className={`p-3.5 rounded-2xl border bg-background flex items-center justify-between transition-colors cursor-pointer ${
                          selectedForBulk.has(stud.id)
                            ? "border-brand bg-brand/5 ring-1 ring-brand/30"
                            : "border-border hover:border-brand/40"
                        }`}
                        onClick={() => toggleStudentSelection(stud.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedForBulk.has(stud.id)}
                            onChange={() => toggleStudentSelection(stud.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border text-brand focus:ring-brand accent-[var(--color-brand)] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-foreground text-sm truncate">{stud.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{stud.email}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-accent/80 font-semibold text-foreground">
                                {stud.collegeName || stud.collegeId}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-brand/10 text-brand font-semibold">
                                {stud.department}
                              </span>
                              {stud.academicYear && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 font-semibold">
                                  {stud.academicYear}
                                </span>
                              )}
                              {stud.section && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-semibold">
                                  Sec {stud.section}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          disabled={addingId === stud.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddStudentToBatch(stud);
                          }}
                          className="h-8 px-3 rounded-xl bg-brand hover:bg-brand/90 text-brand-foreground text-xs font-bold shrink-0 gap-1"
                        >
                          {addingId === stud.id ? "Adding..." : "+ Add"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-xs">
                    No matching students found from existing colleges. Try adjusting filters or search query.
                  </div>
                )}
              </div>
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
        confirmText={confirmConfig?.confirmText || "Confirm"}
        variant={confirmConfig?.variant || "destructive"}
      />
    </motion.div>
  );
}
