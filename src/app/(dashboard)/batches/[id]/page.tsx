"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { 
  ArrowLeft, 
  BookOpen, 
  Users, 
  Trash2, 
  Search, 
  Building2, 
  UserPlus, 
  CheckCircle2, 
  Edit2, 
  X, 
  Check,
  Filter,
  RotateCcw,
  Sparkles,
  GraduationCap
} from "lucide-react";
import { toast } from "sonner";
import { useErrorHandler } from "@/providers/error-provider";
import { FilterDropdown } from "@/components/shared/filter-dropdown";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { uniqueOptions } from "@/lib/utils/array";
import { toMillis } from "@/lib/utils/date";
import { getBatchById, updateBatch, bulkAddStudentsToBatch, bulkRemoveStudentsFromBatch, getStudentsInBatch } from "@/lib/services";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";
import { refreshCache } from "@/lib/data/lms-data-cache";
import { formatDisplayName } from "@/lib/utils";
import type { Batch, Student, College } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function BatchDetailPage({ params }: PageProps) {
  const { showError } = useErrorHandler();
  const resolvedParams = use(params);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState<{ 
    isOpen: boolean; 
    title: string; 
    message: string; 
    onConfirm?: () => void; 
    confirmText?: string; 
    variant?: "destructive" | "warning" | "info" | "success" 
  } | null>(null);

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

  const cachedStudents = useLMSDataSelector((s) => s.students);
  const cachedColleges = useLMSDataSelector((s) => s.colleges);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const batData = await getBatchById(resolvedParams.id);
        setBatch(batData);
        
        // Load students enrolled in this batch
        const enrolledStudentsData = await getStudentsInBatch(resolvedParams.id);
        const enrolledIds = new Set(enrolledStudentsData.map((s: any) => s.id));
        
        // Merge cached students with batch membership info
        const allStudentsWithBatchInfo = cachedStudents.map((s) => ({
          ...s,
          batchIds: enrolledIds.has(s.id) ? [resolvedParams.id] : (s.batchIds || [])
        }));
        
        // Add enrolled students that might not be in cache
        enrolledStudentsData.forEach((enrolledStudent: any) => {
          if (!cachedStudents.find(cs => cs.id === enrolledStudent.id)) {
            allStudentsWithBatchInfo.push({
              ...enrolledStudent,
              batchIds: [resolvedParams.id]
            });
          }
        });
        
        setAllStudents(allStudentsWithBatchInfo);
        setColleges(cachedColleges);
        
        console.log('[BATCH_DETAIL] Loaded:', {
          batchId: resolvedParams.id,
          enrolledCount: enrolledStudentsData.length,
          totalStudents: allStudentsWithBatchInfo.length,
        });
      } catch (err) {
        console.error("Error loading batch details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [resolvedParams.id, cachedStudents, cachedColleges]);

  const handleRenameBatch = async () => {
    if (!batch || !newName.trim() || newName.trim() === batch.name) {
      setIsRenaming(false);
      return;
    }
    setIsSavingName(true);
    try {
      await updateBatch(batch.id, { name: newName.trim() });
      setBatch({ ...batch, name: newName.trim() });
      toast.success("Batch renamed successfully");
      setIsRenaming(false);
    } catch (err) {
      console.error("Error renaming batch:", err);
      showError({ message: "Failed to rename batch" });
    } finally {
      setIsSavingName(false);
    }
  };

  // Resolve matching college for this batch
  const batchCollege = useMemo(() => {
    if (!batch?.collegeId || batch.collegeId === "global" || batch.collegeId === "ALL" || batch.collegeId === "GLOBAL" || batch.collegeId === "unassigned" || batch.collegeId === "UNASSIGNED") {
      return null;
    }
    const target = batch.collegeId.toLowerCase();
    return colleges.find(
      (c) => c.id.toLowerCase() === target || (c.name && c.name.toLowerCase() === target)
    ) || null;
  }, [batch, colleges]);

  const batchCollegeDisplayName = useMemo(() => {
    if (!batch) return "All Institutions";
    if (batchCollege?.name) return batchCollege.name;
    if ((batch as any).collegeName) return (batch as any).collegeName;
    if (batch.collegeId && batch.collegeId !== "global" && batch.collegeId !== "ALL" && batch.collegeId !== "GLOBAL" && batch.collegeId !== "unassigned" && batch.collegeId !== "UNASSIGNED") {
      return batch.collegeId.replace(/^col-/, "");
    }
    return "All Institutions";
  }, [batchCollege, batch]);

  const isCollegeSpecificBatch = useMemo(() => {
    return Boolean(
      batch?.collegeId && 
      batch.collegeId !== "global" && 
      batch.collegeId !== "ALL" && 
      batch.collegeId !== "GLOBAL" &&
      batch.collegeId !== "unassigned" &&
      batch.collegeId !== "UNASSIGNED"
    );
  }, [batch]);

  // STAGE 1: Scoped candidate students strictly for this batch's college
  const eligibleStudents = useMemo(() => {
    if (!isCollegeSpecificBatch) return allStudents;

    const validColKeys = new Set<string>();
    if (batch?.collegeId) validColKeys.add(batch.collegeId.toLowerCase());
    if (batchCollege?.id) validColKeys.add(batchCollege.id.toLowerCase());
    if (batchCollege?.name) validColKeys.add(batchCollege.name.toLowerCase());
    if ((batch as any)?.collegeName) validColKeys.add((batch as any).collegeName.toLowerCase());

    return allStudents.filter((s) => {
      const sId = (s.collegeId || "").toLowerCase();
      const sName = (s.collegeName || "").toLowerCase();
      if (!sId && !sName) return false;
      return (sId && validColKeys.has(sId)) || (sName && validColKeys.has(sName));
    });
  }, [allStudents, isCollegeSpecificBatch, batchCollege, batch]);

  // Filter option lists derived strictly from the eligible student pool
  const deptsList = useMemo(() => {
    const list = eligibleStudents.map((s) => s.department);
    if (batchCollege?.departments) {
      list.push(...batchCollege.departments);
    }
    return uniqueOptions(list.filter(Boolean));
  }, [eligibleStudents, batchCollege]);

  const yearsList = useMemo(() => {
    const list = eligibleStudents.map((s) => s.academicYear);
    if (list.length === 0) list.push("1st Year", "2nd Year", "3rd Year", "4th Year");
    return uniqueOptions(list.filter(Boolean));
  }, [eligibleStudents]);

  const sectionsList = useMemo(() => {
    const list = eligibleStudents.map((s) => s.section);
    if (list.length === 0) list.push("A", "B", "C", "D");
    return uniqueOptions(list.filter(Boolean));
  }, [eligibleStudents]);

  // Reset child filters if options change
  useEffect(() => {
    if (selectedDeptFilter !== "ALL" && !deptsList.includes(selectedDeptFilter)) setSelectedDeptFilter("ALL");
    if (selectedYearFilter !== "ALL" && !yearsList.includes(selectedYearFilter)) setSelectedYearFilter("ALL");
    if (selectedSectionFilter !== "ALL" && !sectionsList.includes(selectedSectionFilter)) setSelectedSectionFilter("ALL");
  }, [deptsList, yearsList, sectionsList, selectedDeptFilter, selectedYearFilter, selectedSectionFilter]);

  const resetModalFilters = () => {
    setModalSearch("");
    setSelectedCollegeFilter("ALL");
    setSelectedDeptFilter("ALL");
    setSelectedYearFilter("ALL");
    setSelectedSectionFilter("ALL");
  };

  const hasActiveModalFilters = modalSearch || selectedDeptFilter !== "ALL" || selectedYearFilter !== "ALL" || selectedSectionFilter !== "ALL" || (!isCollegeSpecificBatch && selectedCollegeFilter !== "ALL");

  if (loading) {
    return (
      <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Loading cohort batch hub...</p>
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
  }).sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));

  const filteredEnrolled = enrolledStudents.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.rollNumber && s.rollNumber.toLowerCase().includes(q)) ||
      (s.department && s.department.toLowerCase().includes(q))
    );
  });

  // Students available to be added: only from eligible pool, not already in batch, matching active filters
  const availableStudents = eligibleStudents.filter((s) => {
    const alreadyIn = s.batchIds && (s.batchIds.includes(batch.id) || s.batchIds.includes(batch.name));
    if (alreadyIn) return false;

    if (!isCollegeSpecificBatch && selectedCollegeFilter !== "ALL") {
      const matchesCol = s.collegeId === selectedCollegeFilter || s.collegeName === selectedCollegeFilter;
      if (!matchesCol) return false;
    }

    if (selectedDeptFilter !== "ALL" && s.department !== selectedDeptFilter) return false;
    if (selectedYearFilter !== "ALL" && s.academicYear !== selectedYearFilter) return false;
    if (selectedSectionFilter !== "ALL" && s.section !== selectedSectionFilter) return false;

    const q = modalSearch.toLowerCase().trim();
    if (q) {
      const matchesSearch =
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.rollNumber && s.rollNumber.toLowerCase().includes(q)) ||
        (s.department && s.department.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    return true;
  }).sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));

  const validSelectedStudents = availableStudents.filter((s) => selectedForBulk.has(s.id));

  const handleAddStudentToBatch = async (student: Student) => {
    if (!batch) return;
    setAddingId(student.id);
    try {
      await bulkAddStudentsToBatch(batch.id, [student.id]);
      
      setAllStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? { ...s, batchIds: Array.from(new Set([...(s.batchIds || []), batch.id])) }
            : s
        )
      );

      toast.success(`${formatDisplayName(student.name)} added to ${batch.name}`);
      refreshCache().catch(() => {});
    } catch (err) {
      console.error("Failed to add student to batch:", err);
      toast.error("Failed to add student to batch.");
    } finally {
      setAddingId(null);
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedForBulk((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (validSelectedStudents.length === availableStudents.length && availableStudents.length > 0) {
      setSelectedForBulk(new Set());
    } else {
      setSelectedForBulk(new Set(availableStudents.map((s) => s.id)));
    }
  };

  const handleBulkAddToBatch = async () => {
    if (!batch || validSelectedStudents.length === 0) return;
    const studentIds = validSelectedStudents.map((s) => s.id);
    setBulkAdding(true);
    try {
      await bulkAddStudentsToBatch(batch.id, studentIds);

      setAllStudents((prev) =>
        prev.map((s) =>
          studentIds.includes(s.id)
            ? { ...s, batchIds: Array.from(new Set([...(s.batchIds || []), batch.id])) }
            : s
        )
      );

      toast.success(`Enrolled ${studentIds.length} student(s) into ${batch.name}`);
      setSelectedForBulk(new Set());
      refreshCache().catch(() => {});
    } catch (err) {
      console.error("Bulk add failed:", err);
      toast.error("Failed to add selected students to batch.");
    } finally {
      setBulkAdding(false);
    }
  };

  const handleRemoveStudent = (student: Student) => {
    if (!batch) return;
    setConfirmConfig({
      isOpen: true,
      title: "Remove Student from Batch",
      message: `Are you sure you want to remove ${student.name} from "${batch.name}"? The student account will remain in the database.`,
      confirmText: "Remove",
      variant: "destructive",
      onConfirm: async () => {
        setRemovingId(student.id);
        try {
          await bulkRemoveStudentsFromBatch(batch.id, [student.id]);

          setAllStudents((prev) =>
            prev.map((s) =>
              s.id === student.id
                ? { ...s, batchIds: (s.batchIds || []).filter((bId) => bId !== batch.id && bId !== batch.name) }
                : s
            )
          );

          toast.success(`Removed ${student.name} from ${batch.name}`);
          refreshCache().catch(() => {});
        } catch (err) {
          console.error("Failed to remove student from batch:", err);
          toast.error("Failed to remove student from batch.");
        } finally {
          setRemovingId(null);
        }
      }
    });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/batches"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to All Batches
          </Link>
          
          {isRenaming ? (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-border bg-card text-lg font-bold text-foreground focus:outline-none focus:border-brand w-full max-w-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleRenameBatch()}
                />
                <Button size="icon" onClick={handleRenameBatch} disabled={isSavingName} className="h-10 w-10 bg-brand hover:bg-brand/90 text-brand-foreground rounded-xl shrink-0">
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => setIsRenaming(false)} disabled={isSavingName} className="h-10 w-10 rounded-xl shrink-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {batch.description || "Manage student enrollment and cohort roster for tests and resource sharing."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 mt-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">{batch.name}</h1>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => { setNewName(batch.name); setIsRenaming(true); }}
                  className="w-8 h-8 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Rename Batch"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl mt-1">
                {batch.description || "Manage student enrollment and cohort roster for tests and resource sharing."}
              </p>
            </div>
          )}
        </div>

        <Button onClick={() => setShowAddModal(true)} className="h-11 px-5 rounded-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold shadow-lg shadow-brand/20 gap-2 shrink-0">
          <UserPlus className="w-4 h-4 stroke-[2.5]" /> Enroll Students
        </Button>
      </div>

      {/* Cohort Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Total Enrolled</p>
            <p className="text-xl font-extrabold text-foreground">{enrolledStudents.length} Students</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Institution</p>
            <p className="text-sm font-bold text-foreground truncate" title={batchCollegeDisplayName}>
              {batchCollegeDisplayName}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Academic Year</p>
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
          Showing <span className="text-foreground font-bold">{filteredEnrolled.length}</span> of {enrolledStudents.length} cohort members
        </div>
      </div>

      {/* Enrolled Students Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {filteredEnrolled.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-bold">
                <tr>
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Academic Year</th>
                  <th className="px-6 py-4">Section</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEnrolled.map((student) => (
                  <tr key={student.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs uppercase">
                          {student.name ? student.name.slice(0, 2) : "ST"}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{student.name}</p>
                          {student.rollNumber && (
                            <p className="text-[11px] text-muted-foreground">Roll: {student.rollNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">{student.email}</td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-brand/10 text-brand">
                        {student.department || "General"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-foreground">{student.academicYear || "—"}</td>
                    <td className="px-6 py-4 text-xs font-medium text-foreground">{student.section || "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={removingId === student.id}
                        onClick={() => handleRemoveStudent(student)}
                        className="w-8 h-8 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                        aria-label="Remove from batch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
            description="Click 'Enroll Students' above to select and assign students from your institution into this batch."
            actionLabel="Enroll Students"
            onAction={() => setShowAddModal(true)}
          />
        )}
      </div>

      {/* Modern High-End Add Students Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="w-full max-w-4xl bg-card rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-xl font-black text-foreground tracking-tight">
                      Enroll Students into {batch.name}
                    </h3>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {batchCollegeDisplayName}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Assign eligible students from {batchCollegeDisplayName} to this batch cohort for targeted assessments and resources.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddModal(false)} 
                  className="rounded-full px-5 font-bold h-9 border-border bg-card hover:bg-accent text-foreground shrink-0"
                >
                  Done
                </Button>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="p-5 border-b border-border bg-background/50 space-y-4">
                {/* Search Bar */}
                <div className="relative w-full">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by name, email, department or roll number..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full h-11 pl-10 pr-10 rounded-xl bg-card border border-border text-sm font-semibold text-foreground focus:outline-none focus:border-brand transition-all shadow-sm"
                  />
                  {modalSearch && (
                    <button 
                      onClick={() => setModalSearch("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filter Dropdowns Grid */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${isCollegeSpecificBatch ? "md:grid-cols-3" : "md:grid-cols-4"} gap-3`}>
                  {!isCollegeSpecificBatch && (
                    <FilterDropdown
                      label="College"
                      value={selectedCollegeFilter === "ALL" ? "" : selectedCollegeFilter}
                      onChange={(val) => setSelectedCollegeFilter(val === "" ? "ALL" : val)}
                      options={colleges.map((c) => ({ value: c.name, label: c.name || "Unnamed College" }))}
                    />
                  )}

                  <FilterDropdown
                    label="Department"
                    value={selectedDeptFilter === "ALL" ? "" : selectedDeptFilter}
                    onChange={(val) => setSelectedDeptFilter(val === "" ? "ALL" : val)}
                    options={deptsList.map((d) => ({ value: d, label: d }))}
                  />

                  <FilterDropdown
                    label="Academic Year"
                    value={selectedYearFilter === "ALL" ? "" : selectedYearFilter}
                    onChange={(val) => setSelectedYearFilter(val === "" ? "ALL" : val)}
                    options={yearsList.map((y) => ({ value: y, label: y }))}
                  />

                  <FilterDropdown
                    label="Section"
                    value={selectedSectionFilter === "ALL" ? "" : selectedSectionFilter}
                    onChange={(val) => setSelectedSectionFilter(val === "" ? "ALL" : val)}
                    options={sectionsList.map((sec) => ({ value: sec, label: sec }))}
                  />
                </div>
                
                {/* Actions Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none bg-card px-3 py-1.5 rounded-xl border border-border hover:border-brand/40 transition-colors">
                      <input
                        type="checkbox"
                        checked={availableStudents.length > 0 && validSelectedStudents.length === availableStudents.length}
                        onChange={toggleSelectAll}
                        disabled={availableStudents.length === 0}
                        className="w-4 h-4 rounded border-border text-brand focus:ring-brand accent-[var(--color-brand)]"
                      />
                      <span className="text-xs font-bold text-foreground">
                        Select All
                      </span>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-brand/10 text-brand">
                        {availableStudents.length}
                      </span>
                    </label>

                    {hasActiveModalFilters && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetModalFilters}
                        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset Filters
                      </Button>
                    )}
                  </div>

                  {validSelectedStudents.length > 0 && (
                    <Button
                      size="sm"
                      disabled={bulkAdding}
                      onClick={handleBulkAddToBatch}
                      className="h-9 px-5 rounded-full bg-brand hover:bg-brand/90 text-brand-foreground text-xs font-extrabold gap-1.5 shadow-lg shadow-brand/20 transition-all"
                    >
                      <UserPlus className="w-4 h-4 stroke-[2.5]" />
                      {bulkAdding
                        ? "Enrolling Students..."
                        : `Enroll ${validSelectedStudents.length} Selected Student${validSelectedStudents.length > 1 ? "s" : ""}`}
                    </Button>
                  )}
                </div>
              </div>

              {/* Candidate Students Grid List */}
              <div className="p-6 overflow-y-auto flex-1 space-y-3">
                {availableStudents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {availableStudents.map((stud) => {
                      const isSelected = selectedForBulk.has(stud.id);
                      return (
                        <div
                          key={stud.id}
                          onClick={() => toggleStudentSelection(stud.id)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? "border-brand bg-brand/5 ring-2 ring-brand/30 shadow-sm"
                              : "border-border bg-card hover:border-brand/40 hover:bg-muted/10"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleStudentSelection(stud.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-border text-brand focus:ring-brand accent-[var(--color-brand)] shrink-0"
                            />
                            
                            <div className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center font-black text-xs uppercase shrink-0">
                              {stud.name ? stud.name.slice(0, 2) : "ST"}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-foreground text-sm truncate">{stud.name}</p>
                                {stud.rollNumber && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted font-bold text-muted-foreground">
                                    {stud.rollNumber}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{stud.email}</p>
                              
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-brand/10 text-brand font-bold">
                                  {stud.department || "General"}
                                </span>
                                {stud.academicYear && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 font-bold">
                                    {stud.academicYear}
                                  </span>
                                )}
                                {stud.section && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-bold">
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
                            className="h-8 px-3 rounded-full bg-brand hover:bg-brand/90 text-brand-foreground text-xs font-bold shrink-0 gap-1"
                          >
                            {addingId === stud.id ? "Adding..." : "+ Add"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-muted/50 text-muted-foreground flex items-center justify-center mx-auto">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-sm">No Eligible Students Found</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                        {hasActiveModalFilters
                          ? "No students matched your search or filters. Try adjusting the department, year, or search criteria."
                          : `All eligible students in ${batchCollegeDisplayName} are already enrolled in this batch.`}
                      </p>
                    </div>
                    {hasActiveModalFilters && (
                      <Button size="sm" variant="outline" onClick={resetModalFilters} className="rounded-full text-xs font-bold">
                        Clear All Filters
                      </Button>
                    )}
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
