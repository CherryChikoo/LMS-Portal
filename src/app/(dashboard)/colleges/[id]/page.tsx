"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useErrorHandler } from "@/providers/error-provider";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Building2, FolderTree, Users, Plus, Trash2, Search, CheckCircle2, Pencil, Ban } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { FilterDropdown } from "@/components/shared/filter-dropdown";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { uniqueOptions } from "@/lib/utils/array";
import { getCollegeById, updateCollege, createCollege, getAllStudents, createStudentProfile, createStudentAuthProfile, getAllBatches, deleteStudentProfile, getStudentByEmail, getStudentsByCollege, updateStudentProfile, deleteDepartmentAndMigrate, renameDepartmentAndMigrate, PREDEFINED_DEPARTMENTS, ensureGeneralDepartment } from "@/lib/services";
import { getDocuments, where } from "@/lib/firebase/firestore";
import { matchesYearFilter } from "@/lib/hierarchy/hierarchy-data";
import type { College, Student, Batch } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

type MaybeTimestamp = Date | { toMillis: () => number } | { seconds: number } | string | number | null | undefined;

function getCreatedTime(date: MaybeTimestamp) {
  if (!date) return 0;
  if (typeof date === "object" && "toMillis" in date && typeof (date as { toMillis: () => number }).toMillis === "function") {
    return (date as { toMillis: () => number }).toMillis();
  }
  if (typeof date === "object" && "seconds" in date && typeof (date as { seconds: number }).seconds === "number") {
    return (date as { seconds: number }).seconds * 1000;
  }
  return new Date(date as string | number | Date).getTime() || 0;
}

export default function CollegeDetailPage({ params }: PageProps) {
  const { showError } = useErrorHandler();
  const resolvedParams = use(params);
  const collegeId = resolvedParams.id;
  const router = useRouter();

  const [college, setCollege] = useState<College | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExternal, setIsExternal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [isCollegeAdmin, setIsCollegeAdmin] = useState(false);

  useEffect(() => {
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.role === "college_admin") {
          setIsCollegeAdmin(true);
        }
      }
    } catch (_) {}
  }, []);

function getYearBadgeStyle(year?: string) {
  const y = year || "1st Year";
  if (y.includes("1")) return "bg-sky-500/15 text-sky-400 border border-sky-500/30";
  if (y.includes("2")) return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
  if (y.includes("3")) return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
  if (y.includes("4")) return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
  return "bg-brand/15 text-brand border border-brand/30";
}

  // Filters
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("ALL");
  const [selectedYearFilter, setSelectedYearFilter] = useState("ALL");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("ALL");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Add Department Modal
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [selectedAddDepts, setSelectedAddDepts] = useState<string[]>(["Computer Science & Engineering (CSE)"]);
  const [newDeptName, setNewDeptName] = useState("");
  const [addingDept, setAddingDept] = useState(false);

  // Rename Department Modal
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [renamingDept, setRenamingDept] = useState(false);
  const [renameDeptError, setRenameDeptError] = useState<string | null>(null);

  // Enroll Student Modal
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [studName, setStudName] = useState("");
  const [studEmail, setStudEmail] = useState("");
  const [studDept, setStudDept] = useState("");
  const [studYear, setStudYear] = useState("1st Year");
  const [studSection, setStudSection] = useState("A");
  const [customStudSection, setCustomStudSection] = useState("");
  const [studBatch, setStudBatch] = useState("General Cohort");

  // Edit Student Modal (also enables editing self-registered / outside-institution students)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStudName, setEditStudName] = useState("");
  const [editStudEmail, setEditStudEmail] = useState("");
  const [editStudDept, setEditStudDept] = useState("");
  const [editStudYear, setEditStudYear] = useState("1st Year");
  const [editStudSection, setEditStudSection] = useState("A");
  const [editStudCustomSection, setEditStudCustomSection] = useState("");
  const [editStudBatch, setEditStudBatch] = useState("General Cohort");
  const [savingEditStudent, setSavingEditStudent] = useState(false);
  const [editStudentError, setEditStudentError] = useState<string | null>(null);

  useEffect(() => {
    const loadCollege = async () => {
      setLoading(true);
      try {
        const decodedId = decodeURIComponent(collegeId);
        const [colDataRaw, allStuds, allBatches] = await Promise.all([
          getCollegeById(collegeId),
          getAllStudents(),
          getAllBatches(),
        ]);

        let colData = colDataRaw;
        let external = false;
        if (!colData) {
          const extStuds = allStuds.filter(
            (s) => s.collegeId === decodedId || s.collegeName?.toLowerCase() === decodedId.toLowerCase()
          );
          if (extStuds.length > 0) {
            external = true;
            const extDepts = Array.from(new Set(extStuds.map((s) => s.department).filter(Boolean)));
            colData = {
              id: decodedId,
              name: decodedId,
              code: decodedId.slice(0, 6).toUpperCase(),
              departments: extDepts.length > 0 ? extDepts : ["General"],
              studentCount: extStuds.length,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as College;
          }
        }

        setIsExternal(external);
        setCollege(colData);
        setBatches(allBatches);
        if (colData) {
          // Filter students belonging to this college
          const colStuds = allStuds.filter(
            (s) =>
              s.collegeId === collegeId ||
              s.collegeId === decodedId ||
              s.collegeName?.toLowerCase() === colData.name.toLowerCase()
          );
          setStudents(colStuds);
          if (!studDept && colData.departments && colData.departments.length > 0) {
            setStudDept(colData.departments[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load college details", err);
      } finally {
        setLoading(false);
      }
    };
    loadCollege();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- studDept is set conditionally on first load; adding it would re-trigger fetch when the enroll form changes
  }, [collegeId]);

  const refreshData = async () => {
    try {
      const decodedId = decodeURIComponent(collegeId);
      const [colDataRaw, allStuds, allBatches] = await Promise.all([
        getCollegeById(collegeId),
        getAllStudents(),
        getAllBatches(),
      ]);

      let colData = colDataRaw;
      let external = isExternal;
      if (!colData) {
        const extStuds = allStuds.filter(
          (s) => s.collegeId === decodedId || s.collegeName?.toLowerCase() === decodedId.toLowerCase()
        );
        if (extStuds.length > 0) {
          external = true;
          const extDepts = Array.from(new Set(extStuds.map((s) => s.department).filter(Boolean)));
          colData = {
            id: decodedId,
            name: decodedId,
            code: decodedId.slice(0, 6).toUpperCase(),
            departments: extDepts.length > 0 ? extDepts : ["General"],
            studentCount: extStuds.length,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as College;
        }
      }

      setIsExternal(external);
      setCollege(colData);
      setBatches(allBatches);
      if (colData) {
        const colStuds = allStuds.filter(
          (s) =>
            s.collegeId === collegeId ||
            s.collegeId === decodedId ||
            s.collegeName?.toLowerCase() === colData.name.toLowerCase()
        );
        setStudents(colStuds);
        if (!studDept && colData.departments && colData.departments.length > 0) {
          setStudDept(colData.departments[0]);
        }
      }
    } catch (err) {
      console.error("Failed to refresh college details", err);
    }
  };

  // For external (self-registered) colleges there is no Firestore document.
  // Create one on first managed operation so updateCollege has a document to target.
  const ensureCollegeDocument = async (): Promise<string | null> => {
    if (!college) return null;
    if (!isExternal) return college.id;
    const existing = await getCollegeById(college.id);
    if (existing) {
      setIsExternal(false);
      return college.id;
    }
    try {
      await createCollege({
        name: college.name.toLowerCase(),
        code: college.code,
        departments: college.departments || ["General"],
        studentCount: college.studentCount || students.length,
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          companyName: college.name,
          companySubtitle: "College Portal",
          logoBase64: "",
        },
      });
      setIsExternal(false);
      return college.id;
    } catch (err) {
      console.error("Failed to create college document for external institution:", err);
      return null;
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!college) return;
    setAddingDept(true);
    try {
      const collegeDocId = await ensureCollegeDocument();
      if (!collegeDocId) {
        setAddingDept(false);
        return;
      }
      const deptsToAdd: string[] = [];
      selectedAddDepts.forEach((d) => {
        if (d === "Custom Department") {
          if (newDeptName.trim()) {
            newDeptName.split(",").forEach((c) => {
              const trimmed = c.trim();
              if (trimmed && !deptsToAdd.includes(trimmed)) deptsToAdd.push(trimmed);
            });
          }
        } else if (d !== "General" && !deptsToAdd.includes(d)) {
          deptsToAdd.push(d);
        }
      });
      if (deptsToAdd.length === 0) {
        setAddingDept(false);
        return;
      }
      const updatedDepts = ensureGeneralDepartment(Array.from(new Set([...(college.departments || []), ...deptsToAdd])));
      await updateCollege(collegeDocId, { departments: updatedDepts });
      setShowAddDeptModal(false);
      setSelectedAddDepts(["Computer Science & Engineering (CSE)"]);
      setNewDeptName("");
      await refreshData();
    } catch (err) {
      console.error("Error adding department:", err);
    } finally {
      setAddingDept(false);
    }
  };

  const handleRenameDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!college || !editingDept || !editDeptName.trim()) return;
    const trimmedNewName = editDeptName.trim();
    const oldName = editingDept;

    if (trimmedNewName.toLowerCase() === oldName.toLowerCase()) {
      setRenameDeptError("The new name must be different from the current one.");
      return;
    }
    const duplicateExists = (college.departments || []).some(
      (d) => d.toLowerCase() === trimmedNewName.toLowerCase() && d.toLowerCase() !== oldName.toLowerCase()
    );
    if (duplicateExists) {
      setRenameDeptError("A department with this name already exists.");
      return;
    }

    setRenamingDept(true);
    setRenameDeptError(null);
    try {
      await renameDepartmentAndMigrate(college.id, oldName, trimmedNewName);
      setEditingDept(null);
      setEditDeptName("");
      await refreshData();
    } catch (err) {
      console.error("Error renaming department:", err);
    } finally {
      setRenamingDept(false);
    }
  };

  const handleDeleteDepartment = (deptName: string) => {
    if (!college || deptName.toLowerCase() === "general") return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Department",
      message: `Delete "${deptName}" from ${college.name}? Students, resources, exams, and doubts in this department will be safely moved to the fallback "General" department.`,
      onConfirm: async () => {
        setLoading(true);
        try {
          await deleteDepartmentAndMigrate(college.id, deptName);
          await refreshData();
        } catch (err) {
          console.error("Error deleting department:", err);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!college || !studName || !studEmail || !studDept) return;
    const normalizedEmail = studEmail.toLowerCase().trim();
    const [existingStudent, existingUsers] = await Promise.all([
      getStudentByEmail(normalizedEmail),
      getDocuments<Record<string, unknown>>("users", [where("email", "==", normalizedEmail)]),
    ]);
    if (existingStudent || existingUsers.length > 0) {
      setEnrollError("A student or user account with this email already exists.");
      setEnrolling(false);
      return;
    }
    setEnrolling(true);
    try {
      await createStudentAuthProfile({
        name: studName,
        email: normalizedEmail,
        collegeId: college.id,
        collegeName: college.name,
        department: studDept,
        academicYear: studYear,
        section: studSection === "CUSTOM" ? customStudSection.trim() || "A" : studSection,
        batch: studBatch,
      });
      await updateCollege(college.id, {
        studentCount: (college.studentCount || students.length) + 1,
      });
      setShowEnrollModal(false);
      setEnrollError(null);
      setStudName("");
      setStudEmail("");
      setCustomStudSection("");
      await refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        setEnrollError("This email is already registered. The student can sign in directly using the Login page instead of being re-enrolled.");
      } else {
        setEnrollError(msg || "Failed to enroll student. Please try again.");
      }
      console.error("Error enrolling student:", err);
    } finally {
      setEnrolling(false);
    }
  };

  const handleOpenEditStudent = (stud: Student) => {
    setEditingStudent(stud);
    setEditStudName(stud.name || "");
    setEditStudEmail(stud.email || "");
    setEditStudDept(stud.department || (college?.departments?.[0] ?? ""));
    setEditStudYear(stud.academicYear || "1st Year");
    const section = stud.section || "A";
    const isKnownSection = ["A", "B", "C", "D"].includes(section);
    setEditStudSection(isKnownSection ? section : "CUSTOM");
    setEditStudCustomSection(isKnownSection ? "" : section);
    setEditStudBatch(stud.batchIds?.[0] || "General Cohort");
    setEditStudentError(null);
  };

  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !editStudName.trim() || !editStudEmail.trim() || !editStudDept.trim()) return;
    const normalizedEmail = editStudEmail.toLowerCase().trim();
    if (normalizedEmail !== editingStudent.email) {
      const [existingStudent, existingUsers] = await Promise.all([
        getStudentByEmail(normalizedEmail),
        getDocuments<Record<string, unknown>>("users", [where("email", "==", normalizedEmail)]),
      ]);
      const isUsedByAnother =
        (existingStudent && existingStudent.id !== editingStudent.id) ||
        existingUsers.some((u) => u.id !== editingStudent.id && (u.email as string)?.toLowerCase() === normalizedEmail);
      if (isUsedByAnother) {
        setEditStudentError("A student or user account with this email already exists.");
        return;
      }
    }
    setSavingEditStudent(true);
    setEditStudentError(null);
    try {
      const res = await updateStudentProfile(editingStudent.id, {
        name: editStudName.trim(),
        email: normalizedEmail,
        department: editStudDept.trim(),
        academicYear: editStudYear,
        section: editStudSection === "CUSTOM" ? editStudCustomSection.trim() || "A" : editStudSection,
        batchIds: [editStudBatch],
        updatedAt: new Date(),
      });
      if (!res.success) {
        setEditStudentError(res.error || "Failed to update student profile.");
        return;
      }
      toast.success("Student profile updated successfully.");
      setEditingStudent(null);
      await refreshData();
    } catch (err) {
      setEditStudentError("Failed to update student. Please try again.");
    } finally {
      setSavingEditStudent(false);
    }
  };

  // Cascading subset: students narrowed by selected Department filter.
  const filteredByDepartment = useMemo(() =>
    selectedDeptFilter === "ALL"
      ? students
      : students.filter((s) => s.department === selectedDeptFilter),
    [students, selectedDeptFilter]
  );

  // Department list derived from actual students in this college.
  const departmentsList = useMemo(() =>
    uniqueOptions(students.map((s) => s.department).filter(Boolean)),
    [students]
  );

  // Year/Section options narrowed by selected Department. Defaults are only added when no
  // Department is selected so that picking a department shows data-first options only.
  const yearsList = useMemo(() => {
    const base = filteredByDepartment.map((s) => s.academicYear);
    if (selectedDeptFilter === "ALL") base.push("1st Year", "2nd Year", "3rd Year", "4th Year");
    return uniqueOptions(base.filter(Boolean));
  }, [filteredByDepartment, selectedDeptFilter]);

  const sectionsList = useMemo(() => {
    const base = filteredByDepartment.map((s) => s.section);
    if (selectedDeptFilter === "ALL") base.push("A", "B", "C", "D");
    return uniqueOptions(base.filter(Boolean));
  }, [filteredByDepartment, selectedDeptFilter]);

  // Reset child filters when the Department selection makes them invalid.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cascading reset: child filters must reset when the parent filter narrows the available options
    if (selectedYearFilter !== "ALL" && !yearsList.includes(selectedYearFilter)) setSelectedYearFilter("ALL");
    if (selectedSectionFilter !== "ALL" && !sectionsList.includes(selectedSectionFilter)) setSelectedSectionFilter("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally exclude selected* values so the reset only fires when the parent filter narrows the option list
  }, [selectedDeptFilter, yearsList, sectionsList]);

  if (loading) {
    return (
      <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading college academic hub...</p>
      </div>
    );
  }

  if (!college) {
    return (
      <div className="space-y-4">
        <Link href="/colleges" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Colleges
        </Link>
        <EmptyState
          icon={Building2}
          title="College Not Found"
          description="The requested institution could not be located in your database."
          actionLabel="Return to College Hub"
          onAction={() => window.location.assign("/colleges")}
        />
      </div>
    );
  }

  const departments = college.departments && college.departments.length > 0 ? college.departments : ["General Academy"];

  const filteredStudents = students
    .filter((s) => {
      const matchesDept = selectedDeptFilter === "ALL" || s.department === selectedDeptFilter;
      const matchesYear = matchesYearFilter(s.academicYear, selectedYearFilter === "ALL" ? "" : selectedYearFilter);
      const matchesSection = selectedSectionFilter === "ALL" || s.section === selectedSectionFilter;
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.rollNumber?.toLowerCase().includes(searchQuery.toLowerCase());

      const now = new Date().getTime();
      const createdTime = getCreatedTime(s.createdAt);
      let matchesTime = false;
      if (timeFilter === "ALL") matchesTime = true;
      else if (timeFilter === "RECENT_24H") matchesTime = !!createdTime && now - createdTime <= 24 * 60 * 60 * 1000;
      else if (timeFilter === "RECENT_7D") matchesTime = !!createdTime && now - createdTime <= 7 * 24 * 60 * 60 * 1000;
      else if (timeFilter === "CSV") matchesTime = s.enrollmentType === "csv";
      else if (timeFilter === "MANUAL") matchesTime = s.enrollmentType === "manual" || !s.enrollmentType;
      else if (timeFilter === "SELF") matchesTime = s.enrollmentType === "self";

      return matchesDept && matchesYear && matchesSection && matchesSearch && matchesTime;
    })
    .sort((a, b) => {
      if (timeFilter === "RECENT_24H" || timeFilter === "RECENT_7D") {
        const timeA = getCreatedTime(a.createdAt);
        const timeB = getCreatedTime(b.createdAt);
        return timeB - timeA;
      }
      return 0;
    });

  const handleDeleteSelectedStudents = () => {
    if (selectedStudentIds.length === 0 || !college) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Enrolled Students",
      message: `Are you sure you want to delete ${selectedStudentIds.length} selected student(s) from ${college.name}?`,
      onConfirm: async () => {
        try {
          const currentSelected = [...selectedStudentIds];
          setStudents((prev) => prev.filter((s) => !currentSelected.includes(s.id)));
          setSelectedStudentIds([]);
          await Promise.all(currentSelected.map((id) => deleteStudentProfile(id)));
          toast.success(`Deleted ${currentSelected.length} student profile(s).`);
        } catch (err) {
          console.error("Failed to delete selected students:", err);
          showError({ message: "Failed to delete selected students." });
        }
      }
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
        onConfirm: async () => {
          try {
            setStudents((prev) =>
              prev.map((s) => (s.id === stud.id ? { ...s, status: newStatus } : s))
            );
            await updateStudentProfile(stud.id, { status: newStatus });
            toast.success(`Restricted "${stud.name}".`);
          } catch (err) {
            console.error("Failed to restrict account:", err);
            showError({ message: "Failed to restrict account." });
          }
        }
      });
    } else {
      setConfirmConfig({
        isOpen: true,
        title: "Reactivate Student Account",
        message: `Are you sure you want to reactivate "${stud.name}"'s account? They will immediately regain access to the LMS.`,
        onConfirm: async () => {
          try {
            setStudents((prev) =>
              prev.map((s) => (s.id === stud.id ? { ...s, status: newStatus } : s))
            );
            await updateStudentProfile(stud.id, { status: newStatus });
            toast.success(`Reactivated "${stud.name}".`);
          } catch (err) {
            console.error("Failed to reactivate account:", err);
            showError({ message: "Failed to reactivate account." });
          }
        }
      });
    }
  };

  const handleDeleteSingleStudent = (stud: Student) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Student Profile",
      message: `Are you sure you want to delete student ${stud.name}?`,
      onConfirm: async () => {
        try {
          setStudents((prev) => prev.filter((s) => s.id !== stud.id));
          setSelectedStudentIds((prev) => prev.filter((id) => id !== stud.id));
          await deleteStudentProfile(stud.id);
          toast.success(`Deleted ${stud.name}.`);
        } catch (err) {
          console.error("Failed to delete student:", err);
          showError({ message: "Failed to delete student." });
        }
      }
    });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-8">
      {/* Top navigation bar */}
      <div className="flex items-center justify-between">
        {!isCollegeAdmin && (
          <Link href="/colleges" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-brand transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to All Colleges
          </Link>
        )}
      </div>

      <PageHeader
        title={`${college.name} Hub`}
        description={`Manage academic departments, sections, and student enrollment inside ${college.name}.`}
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowAddDeptModal(true)}
              variant="outline"
              className="border border-border hover:bg-accent flex items-center gap-2 text-xs"
            >
              <FolderTree className="w-4 h-4 text-brand" />
              <span>+ Add Department</span>
            </Button>
            <Button
              onClick={() => {
                if (departments.length > 0 && !studDept) setStudDept(departments[0]);
                setEnrollError(null);
                setShowEnrollModal(true);
              }}
              className="bg-brand hover:bg-brand/90 text-brand-foreground flex items-center gap-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Enroll Student in College</span>
            </Button>
          </div>
        }
      />

      {/* Department Cards Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-brand" />
            <span>Departments Created inside {college.name}</span>
          </h3>
          <span className="text-xs text-muted-foreground">Click a department to filter or enroll students</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {departments.map((dept, idx) => {
            const deptCount = students.filter((s) => s.department === dept).length;
            const isSelected = selectedDeptFilter === dept;
            return (
              <motion.div
                key={idx}
                whileHover={{ y: -3 }}
                onClick={() => setSelectedDeptFilter(isSelected ? "ALL" : dept)}
                className={`cursor-pointer rounded-2xl border p-5 transition-all flex flex-col justify-between space-y-4 ${
                  isSelected
                    ? "border-brand bg-brand/10 shadow-lg"
                    : "border-border bg-card/60 hover:border-brand/40"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="w-9 h-9 rounded-xl bg-accent text-brand flex items-center justify-center font-bold text-xs">
                      {dept.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-background border border-border text-muted-foreground">
                      4 Years • A-D
                    </span>
                  </div>
                  <h4 className="font-bold text-foreground text-base leading-tight break-words">{dept}</h4>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                    <Users className="w-3.5 h-3.5 text-brand" />
                    <span>{deptCount} Students Enrolled</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingDept(dept);
                        setEditDeptName(dept);
                        setRenameDeptError(null);
                      }}
                      className="inline-flex items-center gap-1 text-brand font-bold text-[11px] hover:underline"
                      title="Rename Department"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    {dept.toLowerCase() !== "general" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDepartment(dept);
                        }}
                        className="inline-flex items-center gap-1 text-rose-500 font-bold text-[11px] hover:underline"
                        title="Delete Department"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStudDept(dept);
                        setEnrollError(null);
                        setShowEnrollModal(true);
                      }}
                      className="text-brand font-bold text-[11px] hover:underline"
                    >
                      + Enroll Here
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Students Roster Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/40 backdrop-blur-md p-4 rounded-2xl border border-border">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search enrolled student..."
              className="w-full h-9 pl-10 pr-4 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <FilterDropdown
              label="Department"
              value={selectedDeptFilter === "ALL" ? "" : selectedDeptFilter}
              onChange={(val) => setSelectedDeptFilter(val === "" ? "ALL" : val)}
              options={departmentsList.map(d => ({ value: d, label: `${d} (${students.filter((s) => s.department === d).length})` }))}
              className="w-full sm:w-40 lg:w-48"
            />

            <FilterDropdown
              label="Year"
              value={selectedYearFilter === "ALL" ? "" : selectedYearFilter}
              onChange={(val) => setSelectedYearFilter(val === "" ? "ALL" : val)}
              options={yearsList.map(y => ({ value: y, label: y }))}
              className="w-full sm:w-36 lg:w-40"
            />

            <FilterDropdown
              label="Added"
              value={timeFilter === "ALL" ? "" : timeFilter}
              onChange={(val) => setTimeFilter(val === "" ? "ALL" : val)}
              options={[
                { value: "RECENT_24H", label: "Last 24 Hours" },
                { value: "RECENT_7D", label: "Last 7 Days" },
                { value: "CSV", label: "CSV Uploads" },
                { value: "MANUAL", label: "Manual Entry" },
              ]}
              className="w-full sm:w-36 lg:w-44"
            />

            <FilterDropdown
              label="Section"
              value={selectedSectionFilter === "ALL" ? "" : selectedSectionFilter}
              onChange={(val) => setSelectedSectionFilter(val === "" ? "ALL" : val)}
              options={sectionsList.map(sec => ({ value: sec, label: ["A", "B", "C", "D"].includes(sec) ? `Sec ${sec}` : sec }))}
              className="w-full sm:w-36 lg:w-40"
            />
          </div>
        </div>

        {selectedStudentIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-foreground"
          >
            <div className="flex items-center gap-2 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span>{selectedStudentIds.length} Student Profile{selectedStudentIds.length > 1 ? "s" : ""} Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedStudentIds([])}
                className="h-7 px-2.5 text-xs border-border hover:bg-background"
              >
                Deselect All
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteSelectedStudents}
                className="h-7 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </Button>
            </div>
          </motion.div>
        )}

        {filteredStudents.length === 0 ? (
          <EmptyState
            icon={Users}
            title={students.length === 0 ? `No students enrolled in ${college.name} yet` : "No matching students found"}
            description={
              students.length === 0
                ? "Click 'Enroll Student in College' or pick a department above to add students."
                : "Try adjusting your search query or department filter."
            }
            actionLabel="Enroll First Student"
            onAction={() => {
              setEnrollError(null);
              setShowEnrollModal(true);
            }}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3.5 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={filteredStudents.length > 0 && selectedStudentIds.length === filteredStudents.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStudentIds(filteredStudents.map((s) => s.id));
                        } else {
                          setSelectedStudentIds([]);
                        }
                      }}
                      className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4">Student Name</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Department & Year</th>
                  <th className="py-3.5 px-4">Section / Cohort</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredStudents.map((stud) => {
                  const isSelected = selectedStudentIds.includes(stud.id);
                  return (
                    <tr 
                      key={stud.id} 
                      onClick={() => router.push(`/students/${stud.id}`)}
                      className={`cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "bg-brand/5" : ""}`}
                    >
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStudentIds((prev) => [...prev, stud.id]);
                            } else {
                              setSelectedStudentIds((prev) => prev.filter((id) => id !== stud.id));
                            }
                          }}
                          className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-bold text-foreground flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs">
                          {stud.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{stud.name}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-muted-foreground">{stud.email}</td>
                      <td className="py-3.5 px-4 flex items-center gap-2">
                        <span className="font-semibold text-foreground">{stud.department}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${getYearBadgeStyle(stud.academicYear)}`}>
                          {stud.academicYear || "1st Year"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-accent/80 border border-border/50 font-mono text-[11px] font-semibold text-foreground whitespace-nowrap">
                            Sec {stud.section || "N/A"}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-brand/10 border border-brand/20 font-mono text-[11px] font-semibold text-brand whitespace-nowrap">
                            {stud.batchIds?.[0] ? (batches.find(b => b.id === stud.batchIds![0])?.name || "Unknown Batch") : "Unassigned"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
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
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
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
                          onClick={() => handleOpenEditStudent(stud)}
                          className="h-8 w-8 p-0 text-brand hover:text-brand/90 hover:bg-brand/10 rounded-lg"
                          title="Edit Student Profile"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSingleStudent(stud)}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg"
                          title="Remove Student Profile"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Department Modal */}
      <AnimatePresence>
        {showAddDeptModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-bold text-foreground">Add Department to {college.name}</h3>
                <button onClick={() => setShowAddDeptModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>

              <form onSubmit={handleAddDepartment} className="space-y-4 text-xs">
                <div className="space-y-2">
                  <label className="font-semibold text-foreground">Select Department(s) to Add</label>
                  <div className="max-h-48 overflow-y-auto p-2.5 rounded-xl border border-border bg-background/50 space-y-2 grid grid-cols-1 gap-1.5">
                    {PREDEFINED_DEPARTMENTS.map((d) => {
                      const isAlreadyPresent = (college.departments || []).includes(d) && d !== "Custom Department";
                      const isChecked = selectedAddDepts.includes(d) || isAlreadyPresent;
                      return (
                        <label
                          key={d}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isChecked && !isAlreadyPresent
                              ? "bg-brand/10 border-brand/40 text-foreground font-semibold"
                              : "border-border/60 hover:bg-muted/50 text-muted-foreground"
                          } ${isAlreadyPresent ? "opacity-60 cursor-not-allowed bg-muted/40" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isAlreadyPresent}
                            onChange={(e) => {
                              if (isAlreadyPresent) return;
                              if (e.target.checked) {
                                setSelectedAddDepts((prev) => [...prev, d]);
                              } else {
                                setSelectedAddDepts((prev) => prev.filter((item) => item !== d));
                              }
                            }}
                            className="rounded border-border text-brand focus:ring-brand/50 w-4 h-4"
                          />
                          <span className="truncate">{d} {isAlreadyPresent ? "(Already Added)" : ""}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {selectedAddDepts.includes("Custom Department") && (
                  <div className="space-y-1.5 pt-1">
                    <label className="font-semibold text-foreground">Custom Department Name(s)</label>
                    <input
                      type="text"
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      required
                      placeholder="e.g. Artificial Intelligence & Data Science (comma separated)"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                    />
                    <p className="text-[10px] text-muted-foreground">You can enter multiple custom departments separated by commas.</p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setShowAddDeptModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={addingDept} className="bg-brand text-brand-foreground">
                    {addingDept ? "Adding..." : "Add Department"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Department Modal */}
      <AnimatePresence>
        {editingDept && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-bold text-foreground">Rename Department</h3>
                <button
                  onClick={() => {
                    setEditingDept(null);
                    setEditDeptName("");
                    setRenameDeptError(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleRenameDepartment} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Department Name</label>
                  <input
                    type="text"
                    value={editDeptName}
                    onChange={(e) => {
                      setEditDeptName(e.target.value);
                      setRenameDeptError(null);
                    }}
                    required
                    placeholder="e.g. Artificial Intelligence & Data Science"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>
                {renameDeptError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 p-3 rounded-xl text-sm" role="alert">
                    {renameDeptError}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingDept(null);
                      setEditDeptName("");
                      setRenameDeptError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={renamingDept} className="bg-brand text-brand-foreground">
                    {renamingDept ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEditStudent} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Full Name</label>
                    <input
                      type="text"
                      value={editStudName}
                      onChange={(e) => setEditStudName(e.target.value)}
                      required
                      placeholder="e.g. Priya Sharma"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Email Address</label>
                    <input
                      type="email"
                      value={editStudEmail}
                      onChange={(e) => setEditStudEmail(e.target.value)}
                      required
                      placeholder="priya@college.edu"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department</label>
                    <select
                      value={editStudDept}
                      onChange={(e) => setEditStudDept(e.target.value)}
                      required
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      {departments.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Academic Year</label>
                    <select
                      value={editStudYear}
                      onChange={(e) => setEditStudYear(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Section</label>
                    <select
                      value={editStudSection}
                      onChange={(e) => setEditStudSection(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      {sectionsList.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                      <option value="CUSTOM">+ Custom Section...</option>
                    </select>
                    {editStudSection === "CUSTOM" && (
                      <input
                        type="text"
                        value={editStudCustomSection}
                        onChange={(e) => setEditStudCustomSection(e.target.value)}
                        required
                        placeholder="Type custom section"
                        className="w-full h-9 px-3 mt-1.5 rounded-xl border border-brand bg-background text-foreground text-xs"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Custom Batch / Cohort</label>
                    <select
                      value={editStudBatch}
                      onChange={(e) => setEditStudBatch(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      <option value="General Cohort">General Cohort</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name || "Unnamed College"}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {editStudentError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 p-3 rounded-xl text-sm" role="alert">
                    {editStudentError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setEditingStudent(null)}>Cancel</Button>
                  <Button type="submit" disabled={savingEditStudent} className="bg-brand text-brand-foreground">
                    {savingEditStudent ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Enroll Student Modal */}
      <AnimatePresence>
        {showEnrollModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-base font-bold text-foreground">Enroll Student inside {college.name}</h3>
                  <p className="text-[11px] text-muted-foreground">Assigned exclusively to this college hierarchy</p>
                </div>
                <button onClick={() => setShowEnrollModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>

              <form onSubmit={handleEnrollStudent} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Student Name</label>
                    <input
                      type="text"
                      value={studName}
                      onChange={(e) => setStudName(e.target.value)}
                      required
                      placeholder="e.g. Priya Sharma"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Email Address</label>
                    <input
                      type="email"
                      value={studEmail}
                      onChange={(e) => setStudEmail(e.target.value)}
                      required
                      placeholder="priya@college.edu"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department (Created inside {college.name})</label>
                    <select
                      value={studDept}
                      onChange={(e) => setStudDept(e.target.value)}
                      required
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      {departments.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Academic Year</label>
                    <select
                      value={studYear}
                      onChange={(e) => setStudYear(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Section</label>
                    <select
                      value={studSection}
                      onChange={(e) => setStudSection(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      {sectionsList.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                      <option value="CUSTOM">+ Custom Section...</option>
                    </select>
                    {studSection === "CUSTOM" && (
                      <input
                        type="text"
                        value={customStudSection}
                        onChange={(e) => setCustomStudSection(e.target.value)}
                        required
                        placeholder="Type custom section (e.g. Sec E, Honors)"
                        className="w-full h-9 px-3 mt-1.5 rounded-xl border border-brand bg-background text-foreground text-xs"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Custom Batch / Cohort</label>
                    <select
                      value={studBatch}
                      onChange={(e) => setStudBatch(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      <option value="General Cohort">General Cohort</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name || "Unnamed College"}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {enrollError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 p-3 rounded-xl text-sm" role="alert">
                    {enrollError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setShowEnrollModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={enrolling} className="bg-brand text-brand-foreground">
                    {enrolling ? "Enrolling..." : "Enroll Student inside College"}
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
