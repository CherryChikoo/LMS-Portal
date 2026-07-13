"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  ShieldAlert,
  Activity,
  Search,
  Filter,
  Clock,
  ClipboardList,
  GraduationCap,
  Users,
  FolderOpen,
  Trophy,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Download,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { GlassCard } from "@/components/shared/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { staggerContainer, staggerItem, fadeInUp } from "@/lib/animations";
import {
  getAllExamsIncludingDeleted,
  getEffectiveExamStatus,
  getStudentAttempts,
} from "@/lib/services/exam-service";
import { getAllStudents } from "@/lib/services/student-service";
import { getAllColleges } from "@/lib/services/college-service";
import { getAllResources } from "@/lib/services/resource-service";
import { toDate } from "@/lib/utils/date";
import type { Exam, Student, College, Resource, ExamAttempt } from "@/types";

interface AuditEvent {
  id: string;
  type: "assessment" | "college" | "student" | "resource" | "attempt";
  action: string;
  title: string;
  detail: string;
  timestamp: number;
  timeDisplay: string;
  dateDisplay: string;
  status: string;
  statusColor: string;
  icon: any;
  iconColor: string;
  link: string;
  institution?: string;
}

export default function AuditLogPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const loadAuditData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.allSettled([
        getAllExamsIncludingDeleted(),
        getAllStudents(),
        getAllColleges(),
        getAllResources(),
        getStudentAttempts(),
      ]);
      setExams(results[0].status === "fulfilled" ? results[0].value : []);
      setStudents(results[1].status === "fulfilled" ? results[1].value : []);
      setColleges(results[2].status === "fulfilled" ? results[2].value : []);
      setResources(results[3].status === "fulfilled" ? results[3].value : []);
      setAttempts(results[4].status === "fulfilled" ? results[4].value : []);
      results.forEach((r, i) => {
        if (r.status === "rejected") console.error(`Audit data source ${i} failed:`, r.reason);
      });
    } catch (err) {
      console.error("Failed to load audit data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAuditData();
  }, []);

  const auditEvents: AuditEvent[] = useMemo(() => {
    const events: AuditEvent[] = [];

    // 1. Exams
    exams.forEach((ex) => {
      const status = getEffectiveExamStatus(ex);
      let dt = new Date();
      if (ex.deletedAt) {
        dt = toDate(ex.deletedAt) || new Date();
      } else if (ex.updatedAt) {
        dt = toDate(ex.updatedAt) || new Date();
      } else if (ex.createdAt) {
        dt = toDate(ex.createdAt) || new Date();
      } else if (ex.startTime) {
        dt = toDate(ex.startTime) || new Date();
      }
      const isDeleted = !!ex.deletedAt;
      events.push({
        id: `exam-${ex.id}`,
        type: "assessment",
        action: isDeleted ? "Assessment Deleted" : status === "active" ? "Live Assessment Active" : status === "scheduled" ? "Assessment Scheduled" : "Assessment Drafted",
        title: ex.title,
        detail: `Duration: ${ex.duration} mins | Marks: ${ex.totalMarks} | Questions: ${ex.questions?.length || 0}`,
        timestamp: dt.getTime(),
        timeDisplay: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        dateDisplay: dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
        status: isDeleted ? "DELETED" : status === "active" ? "LIVE NOW" : status === "scheduled" ? "SCHEDULED" : status.toUpperCase(),
        statusColor: isDeleted
          ? "bg-red-500/15 text-red-500 border-red-500/20"
          : status === "active"
          ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
          : status === "scheduled"
          ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
          : "bg-muted text-muted-foreground border-border",
        icon: ClipboardList,
        iconColor: "stat-icon-emerald",
        link: "/exams",
        institution: ex.targets?.[0]?.collegeName || ex.targets?.[0]?.names?.[0] || "All Institutions",
      });
    });

    // 2. Colleges
    colleges.forEach((cl) => {
      const dt = toDate(cl.createdAt) || new Date(Date.now() - 86400000 * 5);
      events.push({
        id: `col-${cl.id}`,
        type: "college",
        action: "Partner College Registered",
        title: cl.name,
        detail: `Code: ${cl.code || "N/A"} | Departments: ${cl.departments?.length || 0} configured`,
        timestamp: dt.getTime(),
        timeDisplay: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        dateDisplay: dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
        status: "ACTIVE",
        statusColor: "bg-blue-500/15 text-blue-500 border-blue-500/20",
        icon: GraduationCap,
        iconColor: "stat-icon-blue",
        link: "/colleges",
        institution: cl.name,
      });
    });

    // 3. Students
    students.slice(0, 50).forEach((st) => {
      const dt = toDate(st.createdAt) || new Date(Date.now() - 3600000 * 12);
      events.push({
        id: `stu-${st.id}`,
        type: "student",
        action: "Student Enrolled",
        title: st.name || st.email || "Unknown Student",
        detail: `Email: ${st.email} | Dept: ${st.department || "General"} | Year: ${st.academicYear || "1st Year"}`,
        timestamp: dt.getTime(),
        timeDisplay: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        dateDisplay: dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
        status: "ENROLLED",
        statusColor: "bg-purple-500/15 text-purple-500 border-purple-500/20",
        icon: Users,
        iconColor: "stat-icon-purple",
        link: "/students",
        institution: st.department || "Engineering",
      });
    });

    // 4. Attempts / Evaluations
    attempts.slice(0, 30).forEach((att) => {
      const dt = toDate(att.submittedAt) || new Date();
      events.push({
        id: `att-${att.id}`,
        type: "attempt",
        action: "Exam Evaluation Completed",
        title: att.examTitle || "Assessment Submission",
        detail: `Student Score: ${att.score}/${att.totalMarks} (${att.percentage}%) | Outcome: ${att.passed ? "Passed" : "Needs Review"}`,
        timestamp: dt.getTime(),
        timeDisplay: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        dateDisplay: dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
        status: att.passed ? "PASSED" : "REVIEW",
        statusColor: att.passed ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" : "bg-red-500/15 text-red-500 border-red-500/20",
        icon: Trophy,
        iconColor: att.passed ? "stat-icon-emerald" : "stat-icon-amber",
        link: "/results",
        institution: "Evaluation Engine",
      });
    });

    // 5. Resources
    resources.slice(0, 20).forEach((rs) => {
      const dt = toDate(rs.createdAt) || new Date(Date.now() - 86400000 * 2);
      events.push({
        id: `res-${rs.id}`,
        type: "resource",
        action: "Learning Resource Published",
        title: rs.title,
        detail: `Category: ${rs.category || "General"} | Type: ${rs.type || "Document"}`,
        timestamp: dt.getTime(),
        timeDisplay: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        dateDisplay: dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
        status: "PUBLISHED",
        statusColor: "bg-indigo-500/15 text-indigo-500 border-indigo-500/20",
        icon: FolderOpen,
        iconColor: "stat-icon-blue",
        link: "/resources",
        institution: rs.targets?.[0]?.collegeName || rs.targets?.[0]?.names?.[0] || "All Institutions",
      });
    });

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [exams, colleges, students, attempts, resources]);

  const filteredEvents = useMemo(() => {
    return auditEvents.filter((ev) => {
      if (categoryFilter !== "ALL" && ev.type !== categoryFilter.toLowerCase()) {
        return false;
      }
      if (statusFilter !== "ALL" && ev.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = ev.title.toLowerCase().includes(q);
        const matchAction = ev.action.toLowerCase().includes(q);
        const matchDetail = ev.detail.toLowerCase().includes(q);
        const matchInst = ev.institution?.toLowerCase().includes(q);
        return matchTitle || matchAction || matchDetail || matchInst;
      }
      return true;
    });
  }, [auditEvents, categoryFilter, statusFilter, searchQuery]);

  const handleExportCSV = () => {
    if (filteredEvents.length === 0) return;
    const headers = ["Event ID", "Category", "Action", "Title", "Details", "Status", "Institution", "Date", "Time"];
    const rows = filteredEvents.map((ev) => [
      ev.id,
      ev.type.toUpperCase(),
      ev.action,
      `"${ev.title.replace(/"/g, '""')}"`,
      `"${ev.detail.replace(/"/g, '""')}"`,
      ev.status,
      `"${(ev.institution || "").replace(/"/g, '""')}"`,
      ev.dateDisplay,
      ev.timeDisplay,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `lms_realtime_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 sm:space-y-8 font-sans"
    >
      <PageHeader
        title="Real-time System Audit Log"
        description="Live chronological monitoring of academic assessments, institutional enrollments, evaluation transcripts, and system events across all partner colleges."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-xs font-bold shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Feed Active</span>
            </div>
            <Button
              onClick={() => loadAuditData(true)}
              variant="outline"
              disabled={refreshing || loading}
              className="h-10 px-3.5 border-border hover:bg-accent flex items-center gap-2 text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-brand" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Button
              onClick={handleExportCSV}
              className="h-10 px-4 bg-brand hover:bg-brand/90 text-white font-semibold flex items-center gap-2 text-xs shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit Log</span>
            </Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
      >
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Recorded Events"
            value={loading ? 0 : auditEvents.length}
            icon={Activity}
            iconClassName="stat-icon-blue"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Assessment Actions"
            value={loading ? 0 : auditEvents.filter((e) => e.type === "assessment").length}
            icon={ClipboardList}
            iconClassName="stat-icon-emerald"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Student & Enrollment Events"
            value={loading ? 0 : auditEvents.filter((e) => e.type === "student").length}
            icon={Users}
            iconClassName="stat-icon-purple"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Evaluation Transcripts"
            value={loading ? 0 : auditEvents.filter((e) => e.type === "attempt").length}
            icon={Trophy}
            iconClassName="stat-icon-amber"
          />
        </motion.div>
      </motion.div>

      {/* Filters and Search Bar */}
      <motion.div variants={staggerItem}>
        <GlassCard className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search audit log by title, action, details, or institution..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 bg-background/50 border-border focus:border-brand/60 rounded-xl text-sm font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-1 md:pb-0">
              {["ALL", "LIVE NOW", "ACTIVE", "SCHEDULED", "PASSED", "ENROLLED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === st
                      ? "bg-brand text-white shadow-sm"
                      : "bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground border border-border/40"
                  }`}
                >
                  {st === "ALL" ? "All Status" : st}
                </button>
              ))}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/40 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-muted-foreground mr-1 flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Category:
            </span>
            {[
              { id: "ALL", label: "All Categories", count: auditEvents.length },
              { id: "ASSESSMENT", label: "Assessments", count: auditEvents.filter((e) => e.type === "assessment").length },
              { id: "STUDENT", label: "Students", count: auditEvents.filter((e) => e.type === "student").length },
              { id: "ATTEMPT", label: "Evaluations", count: auditEvents.filter((e) => e.type === "attempt").length },
              { id: "COLLEGE", label: "Colleges", count: auditEvents.filter((e) => e.type === "college").length },
              { id: "RESOURCE", label: "Resources", count: auditEvents.filter((e) => e.type === "resource").length },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                  categoryFilter === cat.id
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-transparent hover:bg-accent/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                    categoryFilter === cat.id ? "bg-background/20 text-background" : "bg-accent text-muted-foreground"
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* Audit Events Feed */}
      <motion.div variants={staggerItem}>
        <GlassCard className="p-6">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border/60">
            <div>
              <h3 className="text-base font-bold text-foreground font-heading flex items-center gap-2">
                <span>Chronological Event Stream</span>
                <span className="text-xs font-mono text-muted-foreground">({filteredEvents.length} events)</span>
              </h3>
            </div>
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand" />
              <span>Real-time UTC/Local Timestamp Sync</span>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-brand mx-auto" />
              <p className="text-sm font-semibold text-muted-foreground">Synchronizing audit logs from cloud database...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="py-20 text-center space-y-3 border border-dashed rounded-2xl border-border/60">
              <FileText className="w-10 h-10 text-muted-foreground/50 mx-auto" />
              <p className="text-base font-bold text-foreground">No matching audit events found</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Try clearing your search query or switching category filters to view historical system activities.
              </p>
              {(searchQuery || categoryFilter !== "ALL" || statusFilter !== "ALL") && (
                <Button
                  onClick={() => {
                    setSearchQuery("");
                    setCategoryFilter("ALL");
                    setStatusFilter("ALL");
                  }}
                  variant="outline"
                  size="sm"
                  className="mt-2 text-xs font-semibold"
                >
                  Reset All Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3 divide-y divide-border/30">
              {filteredEvents.map((ev, index) => {
                const Icon = ev.icon;
                return (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                    className="pt-3.5 first:pt-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:bg-accent/30 dark:hover:bg-white/[0.02] p-3 rounded-xl transition-all border border-transparent hover:border-border/40"
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ev.iconColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold text-brand uppercase tracking-wider font-mono">
                            [{ev.type.toUpperCase()}]
                          </span>
                          <h4 className="text-sm font-bold text-foreground group-hover:text-brand transition-colors">
                            {ev.action}
                          </h4>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${ev.statusColor}`}
                          >
                            {ev.status === "LIVE NOW" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />}
                            {ev.status}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-foreground/90 truncate">
                          {ev.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{ev.detail}</span>
                          {ev.institution && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                              <span className="font-semibold text-foreground/70">{ev.institution}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/30 gap-2">
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-mono font-bold text-foreground">
                          {ev.timeDisplay}
                        </p>
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {ev.dateDisplay}
                        </p>
                      </div>
                      <Link
                        href={ev.link}
                        className="text-xs font-bold text-brand hover:underline flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity"
                      >
                        <span>View Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </motion.div>
    </motion.div>
  );
}
