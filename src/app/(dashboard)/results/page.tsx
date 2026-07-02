"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy,
  CheckCircle2,
  XCircle,
  Award,
  Users,
  Search,
  Eye,
  X,
  Shield,
  Trash2,
  RefreshCw,
  RotateCcw,
  Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { fadeInUp } from "@/lib/animations";
import {
  getStudentAttempts,
  getAllExams,
  getAllStudents,
  getAllColleges,
  deleteResultById,
  clearAllResults,
} from "@/lib/services";
import type { ExamAttempt, Exam, Student, College } from "@/types";

function formatLiveDate(val: any): string {
  if (!val) return "Live Attempt";
  try {
    if (typeof val?.toDate === "function") {
      return val.toDate().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (val?.seconds) {
      return new Date(val.seconds * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    const dateObj = new Date(val);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {
    // fallback
  }
  return "Live Attempt";
}

export default function ResultsPage() {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [actualRole, setActualRole] = useState<string>("admin");
  const [currentStudentUser, setCurrentStudentUser] = useState<any>(null);

  // Role toggle: default to "student" so trainers instantly view student evaluation records
  const [userRole, setUserRole] = useState<"admin" | "student">("student");

  // Powerful Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [examFilter, setExamFilter] = useState("ALL");
  const [studentFilter, setStudentFilter] = useState("ALL");
  const [collegeFilter, setCollegeFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"date_desc" | "score_desc" | "score_asc">("date_desc");

  // Performance Details Modal state
  const [selectedAttempt, setSelectedAttempt] = useState<ExamAttempt | null>(null);

  // Confirm Modal state for Purge / Delete
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [attData, examData, studData, colData] = await Promise.all([
        getStudentAttempts(),
        getAllExams(),
        getAllStudents(),
        getAllColleges(),
      ]);
      setAttempts(attData);
      setExams(examData);
      setStudents(studData);
      setColleges(colData);
    } catch (err) {
      console.error("Failed to fetch results analytics", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const role = localStorage.getItem("lms_role") || "admin";
      setActualRole(role.toLowerCase());
      if (role.toLowerCase() === "student") {
        setUserRole("student");
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) setCurrentStudentUser(JSON.parse(uStr));
      } else {
        setUserRole("student"); // Trainers look at students by default
      }
    } catch (_) {}

    loadData();
  }, []);

  // Unique student names from attempts and students list
  const studentNamesList = useMemo(() => {
    const names = new Set<string>();
    attempts.forEach((a) => {
      const name = a.studentName || "Student Candidate";
      const isAdmin =
        name.toLowerCase().includes("admin") ||
        name.toLowerCase().includes("simulator") ||
        name.toLowerCase().includes("ranti") ||
        name.toLowerCase().includes("trainer") ||
        a.studentId === "admin-1";
      if (!isAdmin) names.add(name);
    });
    students.forEach((s) => {
      if (s.name) names.add(s.name);
    });
    return Array.from(names);
  }, [attempts, students]);

  // Compute live evaluation attempt counts directly from live submission records
  const { liveStudentAttemptsCount, liveTrainerAttemptsCount } = useMemo(() => {
    let sCount = 0;
    let tCount = 0;
    attempts.forEach((a) => {
      const name = a.studentName || "Student Candidate";
      const isAdmin =
        name.toLowerCase().includes("admin") ||
        name.toLowerCase().includes("simulator") ||
        name.toLowerCase().includes("ranti") ||
        name.toLowerCase().includes("trainer") ||
        a.studentId === "admin-1" ||
        (a as any).attemptedBy === "admin";
      if (isAdmin) tCount++;
      else sCount++;
    });
    return { liveStudentAttemptsCount: sCount, liveTrainerAttemptsCount: tCount };
  }, [attempts]);

  // Unique exam IDs / titles from attempts and exams list
  const examSubjectsList = useMemo(() => {
    const set = new Set<string>();
    attempts.forEach((a) => {
      if (a.examId) set.add(a.examId);
    });
    exams.forEach((e) => {
      if (e.id) set.add(e.id);
      if (e.title) set.add(e.title);
    });
    return Array.from(set);
  }, [attempts, exams]);

  // Map student name to college
  const studentCollegeMap = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((s) => {
      if (s.name) map.set(s.name.toLowerCase(), s.collegeName || s.collegeId || "General College");
    });
    return map;
  }, [students]);

  // Filter and sort logic
  const filteredAttempts = useMemo(() => {
    return attempts
      .filter((att) => {
        const name = att.studentName || "Student Candidate";
        const isAdminAttempt =
          name.toLowerCase().includes("admin") ||
          name.toLowerCase().includes("simulator") ||
          name.toLowerCase().includes("ranti") ||
          name.toLowerCase().includes("trainer") ||
          att.studentId === "admin-1" ||
          (att as any).attemptedBy === "admin";

        if (actualRole === "student") {
          if (isAdminAttempt) return false;
          const sId = currentStudentUser?.id;
          const sEmail = (currentStudentUser?.email || "").toLowerCase().trim();

          let belongsToMe = false;
          if (sId && (att.studentId === sId || att.studentId?.toLowerCase() === sEmail)) belongsToMe = true;
          else if (
            sEmail &&
            (att.studentId?.toLowerCase() === sEmail ||
              (att as any).studentEmail?.toLowerCase() === sEmail)
          )
            belongsToMe = true;
          else if (
            sEmail === "student@lms.dev" &&
            (att.studentId === "stud-1" || name.toLowerCase().includes("candidate"))
          )
            belongsToMe = true;

          if (!belongsToMe) return false;
        } else if (userRole === "admin") {
          if (!isAdminAttempt) return false;
        } else {
          if (isAdminAttempt) return false;
          if (studentFilter !== "ALL" && name.toLowerCase() !== studentFilter.toLowerCase()) {
            return false;
          }
        }

        // Search Query filter (candidate name, exam ID, or college)
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const nameMatch = name.toLowerCase().includes(q);
          const examMatch = att.examId.toLowerCase().includes(q);
          const colName = (studentCollegeMap.get(name.toLowerCase()) || "").toLowerCase();
          const colMatch = colName.includes(q);
          if (!nameMatch && !examMatch && !colMatch) return false;
        }

        // Exam Section / Subject Filter
        if (examFilter !== "ALL" && att.examId !== examFilter) return false;

        // Outcome Filter
        if (outcomeFilter === "PASSED" && !att.passed) return false;
        if (outcomeFilter === "FAILED" && att.passed) return false;

        // College Filter
        if (collegeFilter !== "ALL") {
          const sName = name.toLowerCase();
          const col = studentCollegeMap.get(sName) || "General College";
          if (col !== collegeFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "score_desc") return b.percentage - a.percentage;
        if (sortBy === "score_asc") return a.percentage - b.percentage;
        // date_desc
        const timeA =
          (a.submittedAt as any)?.seconds ||
          (a.createdAt as any)?.seconds ||
          new Date(a.submittedAt || a.createdAt || 0).getTime() / 1000;
        const timeB =
          (b.submittedAt as any)?.seconds ||
          (b.createdAt as any)?.seconds ||
          new Date(b.submittedAt || b.createdAt || 0).getTime() / 1000;
        return timeB - timeA;
      });
  }, [
    attempts,
    actualRole,
    currentStudentUser,
    userRole,
    studentFilter,
    searchQuery,
    examFilter,
    outcomeFilter,
    collegeFilter,
    sortBy,
    studentCollegeMap,
  ]);

  const resetAllFilters = () => {
    setSearchQuery("");
    setExamFilter("ALL");
    setStudentFilter("ALL");
    setCollegeFilter("ALL");
    setOutcomeFilter("ALL");
    setSortBy("date_desc");
  };

  const handleDeleteAttempt = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmConfig({
      isOpen: true,
      title: "Delete Audit Record",
      message: "Are you sure you want to permanently delete this test evaluation record?",
      onConfirm: async () => {
        try {
          await deleteResultById(id);
          setAttempts((prev) => prev.filter((a) => a.id !== id));
        } catch (err) {
          console.error("Failed to delete record", err);
        }
      },
    });
  };

  const handlePurgeAllResults = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Purge All Results Data",
      message: "WARNING: This will permanently remove all test attempt records and evaluation breakdowns from the database. Are you sure you want to proceed?",
      onConfirm: async () => {
        try {
          setLoading(true);
          await clearAllResults();
          setAttempts([]);
        } catch (err) {
          console.error("Failed to purge all results", err);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const totalSubmissions = filteredAttempts.length;
  const passCount = filteredAttempts.filter((a) => a.passed).length;
  const passRate = totalSubmissions > 0 ? Math.round((passCount / totalSubmissions) * 100) : 0;
  const highestScore = totalSubmissions > 0 ? Math.max(...filteredAttempts.map((a) => a.percentage)) : 0;
  const avgScore = totalSubmissions > 0 ? Math.round(filteredAttempts.reduce((acc, curr) => acc + curr.percentage, 0) / totalSubmissions) : 0;

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6 max-w-[1600px] mx-auto pb-12 font-sans">
      <PageHeader
        title={actualRole === "student" ? "My Test Results & Audit Transcript" : "Academic Evaluation & Assessment Results"}
        description={
          actualRole === "student"
            ? "View authenticated grading transcripts, AI performance breakdown, and verified institutional scores."
            : "Monitor proctored test evaluations, analyze multi-dimensional cohort performance, and inspect granular candidate transcripts."
        }
        actions={
          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            <Button
              onClick={loadData}
              variant="outline"
              size="sm"
              className="h-9 px-4 border-border hover:bg-accent text-foreground font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>

            {actualRole !== "student" && (
              <Button
                onClick={handlePurgeAllResults}
                variant="destructive"
                size="sm"
                className="h-9 px-4 bg-destructive hover:bg-destructive/90 text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove All Data
              </Button>
            )}
          </div>
        }
      />

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-md flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Submissions</span>
            <p className="text-3xl font-bold text-foreground mt-1">{totalSubmissions}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-md flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Overall Pass Rate</span>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{passRate}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-md flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Average Score</span>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{avgScore}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-md flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Peak Score</span>
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{highestScore}%</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Structured Multi-Criteria Filter & Scope Panel */}
      <div className="bg-card/80 backdrop-blur-md p-5 rounded-2xl border border-border shadow-sm space-y-4">
        {/* Tier 1: Record Scope Toggle & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {actualRole !== "student" && (
              <div className="flex items-center rounded-xl bg-muted p-1 border border-border text-xs shadow-sm">
                <button
                  onClick={() => setUserRole("student")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                    userRole === "student" ? "bg-brand text-white shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Students ({liveStudentAttemptsCount})
                </button>
                <button
                  onClick={() => setUserRole("admin")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                    userRole === "admin" ? "bg-brand text-white shadow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Trainer Simulators ({liveTrainerAttemptsCount})
                </button>
              </div>
            )}

            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidate name, roll no, or exam ID..."
                className="w-full h-9 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 shadow-sm"
              />
            </div>
          </div>

          <Button
            onClick={resetAllFilters}
            variant="outline"
            size="sm"
            className="h-9 px-4 border-border hover:bg-muted text-xs font-bold flex items-center gap-1.5 self-start md:self-auto shrink-0 shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </Button>
        </div>

        {/* Tier 2: Structured Dropdown Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-center">
          {/* Exam Section */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Exam Section</span>
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="h-9 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand shadow-sm truncate"
            >
              <option value="ALL">All Exam Sections</option>
              {examSubjectsList.map((exam) => (
                <option key={exam} value={exam}>
                  {exam}
                </option>
              ))}
            </select>
          </div>

          {/* Student Candidate Filter */}
          {actualRole !== "student" && userRole === "student" && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Student Candidate</span>
              <select
                value={studentFilter}
                onChange={(e) => setStudentFilter(e.target.value)}
                className="h-9 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand shadow-sm truncate"
              >
                <option value="ALL">All Students</option>
                {studentNamesList.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* College Filter */}
          {actualRole !== "student" && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">College</span>
              <select
                value={collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                className="h-9 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand shadow-sm truncate"
              >
                <option value="ALL">All Colleges</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Outcome Filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Outcome</span>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="h-9 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand shadow-sm"
            >
              <option value="ALL">All Outcomes</option>
              <option value="PASSED">Passed Only</option>
              <option value="FAILED">Failed Only</option>
            </select>
          </div>

          {/* Sort By Filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Sort By</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-brand shadow-sm"
            >
              <option value="date_desc">Latest Submissions</option>
              <option value="score_desc">Highest Score</option>
              <option value="score_asc">Lowest Score</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Analyzing performance audit records...</span>
        </div>
      ) : filteredAttempts.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={actualRole !== "student" ? "No attempted examinations found" : "No test attempts found"}
          description={
            searchQuery || examFilter !== "ALL" || studentFilter !== "ALL" || collegeFilter !== "ALL" || outcomeFilter !== "ALL"
              ? "No evaluation records match your selected filter criteria. Try resetting your filters."
              : "When examinations are completed and submitted, graded evaluation records and transcripts will appear here."
          }
          actionLabel={
            searchQuery || examFilter !== "ALL" || studentFilter !== "ALL" || collegeFilter !== "ALL" || outcomeFilter !== "ALL"
              ? "Clear Filters"
              : undefined
          }
          onAction={
            searchQuery || examFilter !== "ALL" || studentFilter !== "ALL" || collegeFilter !== "ALL" || outcomeFilter !== "ALL"
              ? resetAllFilters
              : undefined
          }
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-sm">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-foreground">
                {actualRole !== "student" ? "Institutional Performance Audit Trail" : "My Personal Test Transcript"}
              </h3>
              <span className="text-xs text-muted-foreground font-mono">Verified Grading & Evaluation Logs</span>
            </div>
            <span className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-extrabold">
              {filteredAttempts.length} Records Shown
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-3.5 px-4">Candidate Name</th>
                  <th className="py-3.5 px-4">Exam ID / Subject</th>
                  <th className="py-3.5 px-4">Live Submission Date</th>
                  <th className="py-3.5 px-4">Score Achieved</th>
                  <th className="py-3.5 px-4">Performance Progress</th>
                  <th className="py-3.5 px-4">Time Taken</th>
                  <th className="py-3.5 px-4">Outcome</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAttempts.map((att) => {
                  const sName = att.studentName || "Student Candidate";
                  const liveDateStr = formatLiveDate(att.submittedAt || att.createdAt || att.updatedAt);
                  return (
                    <tr key={att.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-foreground flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xs font-extrabold shrink-0">
                          {sName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="block text-sm leading-tight">{sName}</span>
                          {actualRole !== "student" && (
                            <span className="text-[11px] text-muted-foreground font-normal">
                              {studentCollegeMap.get(sName.toLowerCase()) || "General College"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground font-semibold">{att.examId}</td>
                      <td className="py-3.5 px-4 text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-4">
                        <Calendar className="w-3.5 h-3.5 text-brand" />
                        <span>{liveDateStr}</span>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-foreground">
                        {att.score} <span className="text-xs font-medium text-muted-foreground">/ {att.totalMarks} marks</span>
                      </td>
                      <td className="py-3.5 px-4 w-44">
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 h-2.5 rounded-full bg-muted overflow-hidden border border-border">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${att.passed ? "bg-emerald-600 dark:bg-emerald-500" : "bg-destructive"}`}
                              style={{ width: `${Math.min(100, Math.max(5, att.percentage))}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-bold">{att.percentage}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-muted-foreground font-mono font-semibold">
                        {att.timeTakenMinutes || att.timeTaken || 15} mins
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                            att.passed
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-destructive/15 text-destructive border border-destructive/30"
                          }`}
                        >
                          {att.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          {att.passed ? "PASSED" : "FAILED"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <Button
                          onClick={() => setSelectedAttempt(att)}
                          size="sm"
                          variant="outline"
                          className="text-xs font-bold h-8 border-border hover:bg-accent"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Details
                        </Button>
                        {actualRole !== "student" && (
                          <Button
                            onClick={(e) => handleDeleteAttempt(att.id, e)}
                            size="sm"
                            variant="ghost"
                            className="text-xs font-bold h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Delete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Details Modal */}
      <AnimatePresence>
        {selectedAttempt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 space-y-6 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center font-bold">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">Performance Audit Breakdown</h3>
                    <p className="text-xs text-muted-foreground font-mono">ID: {selectedAttempt.id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAttempt(null)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Candidate</span>
                  <p className="font-bold text-sm text-foreground">{selectedAttempt.studentName || "Student Candidate"}</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Exam Subject</span>
                  <p className="font-mono font-bold text-sm text-foreground">{selectedAttempt.examId}</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Total Score Achieved</span>
                  <p className="font-extrabold text-xl text-brand">
                    {selectedAttempt.score} <span className="text-xs text-muted-foreground font-normal">/ {selectedAttempt.totalMarks} points</span>
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Evaluation Outcome</span>
                  <p className={`font-extrabold text-xl ${selectedAttempt.passed ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {selectedAttempt.percentage}% ({selectedAttempt.passed ? "PASSED" : "FAILED"})
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-brand/5 border border-brand/20 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-foreground">
                  <span>Audit Timestamp:</span>
                  <span className="font-mono text-brand">{formatLiveDate(selectedAttempt.submittedAt || selectedAttempt.createdAt || selectedAttempt.updatedAt)}</span>
                </div>
                <div className="flex items-center justify-between font-bold text-foreground">
                  <span>Duration Consumed:</span>
                  <span className="font-mono">{selectedAttempt.timeTakenMinutes || selectedAttempt.timeTaken || 15} Minutes</span>
                </div>
                <div className="flex items-center justify-between font-bold text-foreground">
                  <span>Privacy Authorization:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">Verified Institutional Attempt</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setSelectedAttempt(null)} className="bg-brand text-white font-bold px-6">
                  Close Breakdown
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Purge / Delete Actions */}
      <ConfirmModal
        isOpen={confirmConfig?.isOpen || false}
        onClose={() => setConfirmConfig(null)}
        onConfirm={() => {
          if (confirmConfig?.onConfirm) confirmConfig.onConfirm();
          setConfirmConfig(null);
        }}
        title={confirmConfig?.title || "Confirm Action"}
        message={confirmConfig?.message || ""}
        variant="destructive"
      />
    </motion.div>
  );
}
