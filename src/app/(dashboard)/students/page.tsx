"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Users, Plus, Upload, Download, Search, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet, Sparkles, Trash2, Clock, StopCircle, Edit2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllStudents, parseStudentsCSV, importStudentsCSV, generateCredentialsCSV, getAllColleges, getAllBatches, createStudentProfile, updateCollege, deleteStudentProfile, updateStudentProfile, subscribeToAllStudents, subscribeToAllColleges, subscribeToAllBatches } from "@/lib/services";
import type { Student, CSVImportSummary, College, Batch } from "@/types";

function StudentsContent() {
  const searchParams = useSearchParams();
  const initialCollegeId = searchParams.get("collegeId") || "";
  const initialBatchId = searchParams.get("batchId") || "";

  const [students, setStudents] = useState<Student[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCollege, setSelectedCollege] = useState(initialCollegeId || "ALL");
  const [selectedYear, setSelectedYear] = useState("ALL");
  const [selectedSection, setSelectedSection] = useState("ALL");
  const [selectedDepartment, setSelectedDepartment] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
  const [newBatch, setNewBatch] = useState(initialBatchId || "General Cohort");

  // Edit Student Modal states
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCollegeId, setEditCollegeId] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editBatch, setEditBatch] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const [studData, colData, batData] = await Promise.all([
        getAllStudents(),
        getAllColleges(),
        getAllBatches(),
      ]);
      setStudents(studData);
      setColleges(colData);
      setBatches(batData);
      if (initialCollegeId && colData.find((c) => c.id === initialCollegeId)) {
        setSelectedCollege(colData.find((c) => c.id === initialCollegeId)?.name || initialCollegeId);
        setNewCollegeId(initialCollegeId);
      }
    } catch (err) {
      console.error("Failed to fetch students data", err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time Firebase listeners for live synchronization
  useEffect(() => {
    setLoading(true);
    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount >= 3) setLoading(false);
    };

    const unsubStudents = subscribeToAllStudents((studData) => {
      setStudents(studData);
      checkLoaded();
    });
    const unsubColleges = subscribeToAllColleges((colData) => {
      setColleges(colData);
      if (initialCollegeId && colData.find((c) => c.id === initialCollegeId)) {
        setSelectedCollege(colData.find((c) => c.id === initialCollegeId)?.name || initialCollegeId);
        setNewCollegeId(initialCollegeId);
      }
      checkLoaded();
    });
    const unsubBatches = subscribeToAllBatches((batData) => {
      setBatches(batData);
      checkLoaded();
    });

    return () => {
      unsubStudents();
      unsubColleges();
      unsubBatches();
    };
  }, [initialCollegeId]);

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setEditName(student.name || "");
    setEditEmail(student.email || "");
    setEditCollegeId(student.collegeId || "GLOBAL");
    setEditDepartment(student.department || "Computer Science");
    setEditYear(student.academicYear || "1st Year");
    setEditSection(student.section || "A");
    setEditBatch(student.batchIds?.[0] || "General Cohort");
  };

  const handleSaveEdit = async () => {
    if (!editingStudent) return;
    setSavingEdit(true);
    try {
      const selectedColObj = colleges.find((c) => c.id === editCollegeId);
      const colName = selectedColObj ? selectedColObj.name : "Global Institute";
      await updateStudentProfile(editingStudent.id, {
        name: editName.trim(),
        email: editEmail.toLowerCase().trim(),
        collegeId: editCollegeId,
        collegeName: colName,
        department: editDepartment.trim(),
        academicYear: editYear,
        section: editSection.trim(),
        batchIds: [editBatch],
      });
      setEditingStudent(null);
    } catch (err) {
      console.error("Failed to update student profile:", err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    cancelImportRef.current = false;
    setCancelling(false);
    setImporting(true);
    setImportSummary(null);
    setImportProgress(null);

    const text = await file.text();
    const rows = parseStudentsCSV(text);

    try {
      const summary = await importStudentsCSV(
        rows,
        (processed, total) => {
          setImportProgress({ processed, total });
        },
        () => cancelImportRef.current
      );
      setImportSummary(summary);
      fetchStudents();
    } catch (err) {
      console.error("Import error", err);
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
      const colName = colObj ? colObj.name : newCollegeId === "GLOBAL" ? "Global Institute" : newCollegeId;
      
      const singleRow = {
         studentName: newName,
         collegeEmail: newEmail.toLowerCase(),
         college: colName,
         department: newDepartment,
         academicYear: newYear,
         section: newSection === "CUSTOM" ? customNewSection.trim() || "A" : newSection,
         batch: newBatch
      };
      
      const summary = await importStudentsCSV([singleRow], undefined, undefined, "manual");
      
      if (summary.failedCount > 0) {
        setConfirmConfig({
          isOpen: true,
          isAlert: true,
          title: "Account Creation Failed",
          message: "Failed to create student account. " + (summary.results[0]?.reason || ""),
          variant: "warning"
        });
      } else if (summary.duplicateCount > 0) {
        setConfirmConfig({
          isOpen: true,
          isAlert: true,
          title: "Duplicate Student Account",
          message: "An account already exists with this email address.",
          variant: "info"
        });
      } else {
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
      }
    } catch (err) {
      console.error("Failed to create student:", err);
    } finally {
      setCreating(false);
    }
  };

  const collegesList = Array.from(new Set([...colleges.map((c) => c.name), ...students.map((s) => s.collegeName || s.collegeId)])).filter(Boolean);
  const departmentsList = Array.from(new Set([...students.map((s) => s.department)])).filter(Boolean);
  const yearsList = Array.from(new Set(["1st Year", "2nd Year", "3rd Year", "4th Year", ...students.map((s) => s.academicYear).filter(Boolean)]));

  const matchesYearFilter = (studentYear: string = "", filter: string): boolean => {
    if (filter === "ALL") return true;
    const s = studentYear.trim().toLowerCase();
    const f = filter.trim().toLowerCase();
    if (s === f) return true;
    if (f.startsWith("1") || f.includes("1st")) return s.startsWith("1") || s.includes("1st") || s.includes("first");
    if (f.startsWith("2") || f.includes("2nd")) return s.startsWith("2") || s.includes("2nd") || s.includes("second");
    if (f.startsWith("3") || f.includes("3rd")) return s.startsWith("3") || s.includes("3rd") || s.includes("third");
    if (f.startsWith("4") || f.includes("4th")) return s.startsWith("4") || s.includes("4th") || s.includes("fourth");
    return s.includes(f) || f.includes(s);
  };

  const filteredStudents = students
    .filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCollege = selectedCollege === "ALL" || s.collegeName === selectedCollege || s.collegeId === selectedCollege;
      const matchesYear = matchesYearFilter(s.academicYear, selectedYear);
      const matchesSection = selectedSection === "ALL" || s.section === selectedSection;
      const matchesDepartment = selectedDepartment === "ALL" || s.department === selectedDepartment;
      const matchesBatch = !initialBatchId || (s.batchIds && s.batchIds.includes(initialBatchId));

      const now = new Date().getTime();
      const getCreatedTime = (date: any) => {
        if (!date) return 0;
        if (typeof date.toMillis === "function") return date.toMillis();
        if (date.seconds) return date.seconds * 1000;
        return new Date(date).getTime() || 0;
      };
      const createdTime = getCreatedTime(s.createdAt);
      let matchesTime = false;
      if (timeFilter === "ALL") matchesTime = true;
      else if (timeFilter === "RECENT_24H") matchesTime = !!createdTime && now - createdTime <= 24 * 60 * 60 * 1000;
      else if (timeFilter === "RECENT_7D") matchesTime = !!createdTime && now - createdTime <= 7 * 24 * 60 * 60 * 1000;
      else if (timeFilter === "CSV") matchesTime = s.enrollmentType === "csv";
      else if (timeFilter === "MANUAL") matchesTime = s.enrollmentType === "manual" || !s.enrollmentType;
      else if (timeFilter === "SELF") matchesTime = s.enrollmentType === "self";

      return matchesSearch && matchesCollege && matchesYear && matchesSection && matchesDepartment && matchesBatch && matchesTime;
    })
    .sort((a, b) => {
      const getCreatedTime = (date: any) => {
        if (!date) return 0;
        if (typeof date.toMillis === "function") return date.toMillis();
        if (date.seconds) return date.seconds * 1000;
        return new Date(date).getTime() || 0;
      };
      if (timeFilter === "RECENT_24H" || timeFilter === "RECENT_7D") {
        const timeA = getCreatedTime(a.createdAt);
        const timeB = getCreatedTime(b.createdAt);
        return timeB - timeA;
      }
      return 0;
    });

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Selected Profiles",
      message: `Are you sure you want to permanently delete ${selectedIds.length} selected student profile(s)? This action cannot be undone.`,
      variant: "destructive",
      onConfirm: async () => {
        setLoading(true);
        try {
          await Promise.all(selectedIds.map((id) => deleteStudentProfile(id)));
          setSelectedIds([]);
          await fetchStudents();
        } catch (err) {
          console.error("Failed to delete selected students:", err);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteStudent = (student: Student) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Student Profile",
      message: `Are you sure you want to permanently delete ${student.name} (${student.email})?`,
      variant: "destructive",
      onConfirm: async () => {
        setLoading(true);
        try {
          await deleteStudentProfile(student.id);
          setSelectedIds((prev) => prev.filter((id) => id !== student.id));
          await fetchStudents();
        } catch (err) {
          console.error("Failed to delete student:", err);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const sectionsList = Array.from(new Set(["A", "B", "C", "D", ...students.map((s) => s.section).filter(Boolean)]));

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Students & Enrollment"
        description="Enroll candidates manually into specific colleges, departments, and custom batches, or import CSV lists."
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-brand hover:bg-brand/90 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Enroll Student</span>
            </Button>
            <Button
              onClick={() => {
                setImportSummary(null);
                setShowImportModal(true);
              }}
              variant="outline"
              className="border border-border hover:bg-accent flex items-center gap-2"
            >
              <Upload className="w-4 h-4 text-brand" />
              <span>Import CSV</span>
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="bg-card/60 backdrop-blur-md p-4.5 rounded-2xl border border-border space-y-3.5 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student name, email address or department..."
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 font-medium"
            />
          </div>
          <div className="text-xs font-bold text-muted-foreground self-end sm:self-center">
            Showing <span className="text-foreground">{filteredStudents.length}</span> of {students.length} Candidates
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-3 border-t border-border/60">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">College</span>
            <select
              value={selectedCollege}
              onChange={(e) => setSelectedCollege(e.target.value)}
              className="h-9.5 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:border-brand w-full"
            >
              <option value="ALL">All Colleges ({students.length})</option>
              {collegesList.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Department</span>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="h-9.5 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:border-brand w-full"
            >
              <option value="ALL">All Departments</option>
              {departmentsList.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Academic Year</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-9.5 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:border-brand w-full"
            >
              <option value="ALL">All Years</option>
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Section</span>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="h-9.5 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:border-brand w-full"
            >
              <option value="ALL">All Sections</option>
              {sectionsList.map((sec) => (
                <option key={sec} value={sec}>
                  {["A", "B", "C", "D"].includes(sec) ? `Sec ${sec}` : sec}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Added Time</span>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="h-9.5 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:border-brand w-full"
            >
              <option value="ALL">All Time</option>
              <option value="RECENT_24H">Last 24 Hours</option>
              <option value="RECENT_7D">Last 7 Days</option>
              <option value="CSV">CSV Uploads</option>
              <option value="MANUAL">Manual Entry</option>
            </select>
          </div>
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

      {loading ? (
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
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
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
                      className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer"
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
                {filteredStudents.map((student) => {
                  const isSelected = selectedIds.includes(student.id);
                  return (
                    <tr key={student.id} className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-brand/5" : ""}`}>
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, student.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== student.id));
                            }
                          }}
                          className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs">
                          {student.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{student.name}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground">{student.email}</td>
                      <td className="py-3.5 px-4 font-medium text-foreground">{student.collegeName || student.collegeId}</td>
                      <td className="py-3.5 px-4 text-xs flex items-center gap-2">
                        <span className="font-semibold text-foreground">{student.department}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${getYearBadgeStyle(student.academicYear)}`}>
                          {student.academicYear || "1st Year"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-accent font-mono text-foreground">
                          Sec {student.section} • {student.batchIds[0] || "General"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            student.mustChangePassword
                              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${student.mustChangePassword ? "bg-amber-500" : "bg-emerald-500"}`} />
                          {student.mustChangePassword ? "Pending First Login" : "Active"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(student)}
                            className="h-8 w-8 p-0 text-sky-500 hover:text-sky-600 hover:bg-sky-500/10 rounded-lg"
                            title="Edit Student Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteStudent(student)}
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
                    <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center space-y-4 hover:border-brand transition-colors bg-background/50">
                      <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Select or Drop CSV File</p>
                        <p className="text-xs text-muted-foreground">Supported file type: .csv (UTF-8 format)</p>
                      </div>
                      <label className="inline-block px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold cursor-pointer hover:bg-brand/90 transition-all">
                        Browse CSV File
                        <input type="file" accept=".csv" onChange={handleFileUpload} disabled={importing} className="hidden" />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Import Summary Results */}
              {importSummary && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-xs text-muted-foreground">Created</span>
                      <p className="text-2xl font-bold text-emerald-500">{importSummary.createdCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="text-xs text-muted-foreground">Duplicates</span>
                      <p className="text-2xl font-bold text-amber-500">{importSummary.duplicateCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                      <span className="text-xs text-muted-foreground">Skipped</span>
                      <p className="text-2xl font-bold text-slate-400">{importSummary.skippedCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                      <span className="text-xs text-muted-foreground">Failed</span>
                      <p className="text-2xl font-bold text-destructive">{importSummary.failedCount}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button onClick={handleDownloadCredentials} className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      <span>Download Credentials CSV ({importSummary.createdCount} Accounts)</span>
                    </Button>
                    <Button onClick={() => setShowImportModal(false)} variant="outline">
                      Done
                    </Button>
                  </div>

                  <div className="max-h-60 overflow-y-auto rounded-xl border border-border text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-muted text-muted-foreground font-semibold sticky top-0">
                        <tr>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">Email</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importSummary.results.map((res, i) => (
                          <tr key={i} className="hover:bg-muted/40">
                            <td className="p-2.5 font-medium text-foreground">{res.name}</td>
                            <td className="p-2.5 font-mono">{res.email}</td>
                            <td className="p-2.5">
                              {res.status === "created" && <span className="text-emerald-500 font-bold">Created</span>}
                              {res.status === "duplicate" && <span className="text-amber-500 font-bold">Duplicate</span>}
                              {res.status === "skipped" && <span className="text-slate-400">Skipped</span>}
                              {res.status === "failed" && <span className="text-destructive font-bold">Failed</span>}
                            </td>
                            <td className="p-2.5 text-muted-foreground">{res.reason || `Pass: ${res.password}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Manual Enroll Student Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Enroll Candidate Profile</h3>
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
                      <option value="GLOBAL">Global Institute</option>
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department</label>
                    <input
                      type="text"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
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
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Section</label>
                    <select
                      value={newSection}
                      onChange={(e) => setNewSection(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      {sectionsList.map((sec) => (
                        <option key={sec} value={sec}>
                          {["A", "B", "C", "D"].includes(sec) ? `Section ${sec}` : sec}
                        </option>
                      ))}
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
                      <option value="General Cohort">General Cohort</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-brand hover:bg-brand/90 text-white">
                    {creating ? "Enrolling..." : "Enroll Candidate"}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
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
                      <option value="GLOBAL">Global Institute</option>
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department</label>
                    <input
                      type="text"
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Academic Year</label>
                    <select
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Section</label>
                    <input
                      type="text"
                      value={editSection}
                      onChange={(e) => setEditSection(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Cohort Batch</label>
                    <select
                      value={editBatch}
                      onChange={(e) => setEditBatch(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                    >
                      <option value="General Cohort">General Cohort</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setEditingStudent(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingEdit} className="bg-brand hover:bg-brand/90 text-white">
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
