"use client";

import { motion } from "motion/react";
import {
  Users,
  GraduationCap,
  ClipboardList,
  FolderOpen,
  Clock,
  FileText,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  PlayCircle,
  Plus,
  Trophy,
  BookOpen,
  AlertCircle,
  Layers,
  Library,
  FilePlus,
  Building2
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/shared/stat-card";
import { GlassCard } from "@/components/shared/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { getAllExamsIncludingDeleted, getAllStudents, getAllColleges, getAllResources, getEffectiveExamStatus, getStudentAttempts, filterResourcesForStudent, filterExamsForStudent, getAllBatches, isAttemptOwnedByStudent } from "@/lib/services";
import { toDate } from "@/lib/utils/date";
import type { Exam, Student, College, Resource, ExamAttempt, Batch, AssignmentTarget } from "@/types";
import { useLMSData, useLMSDataSelector } from "@/lib/data/use-lms-data";
import { useBranding } from "@/providers/branding-provider";

export function StudentPortalDashboard({
  exams,
  resources,
  attempts,
  students,
  loading,
}: {
  exams: Exam[];
  resources: Resource[];
  attempts: ExamAttempt[];
  students: Student[];
  loading: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>({ 
    id: "", name: "", email: "", department: "", rollNumber: "", batchIds: [] 
  });

  useEffect(() => {
    setMounted(true);
    const updateProfile = () => {
      try {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) {
          const parsed = JSON.parse(uStr);
          const sId = parsed.id || parsed.uid;
          const sEmail = parsed.email;
          const canonical = students.find((s) => s.id === sId || (sEmail && s.email === sEmail));
          
          if (canonical) {
            setStudentProfile(canonical);
          } else {
            setStudentProfile(parsed);
          }
        }
      } catch (_) {}
    };
    updateProfile();
    window.addEventListener("storage", updateProfile);
    window.addEventListener("pageshow", updateProfile);
    return () => {
      window.removeEventListener("storage", updateProfile);
      window.removeEventListener("pageshow", updateProfile);
    };
  }, [students]);

  const myAttempts = useMemo(() => {
    if (!studentProfile || (!studentProfile.id && !studentProfile.email && !studentProfile.name)) return attempts;
    return attempts.filter((a) => isAttemptOwnedByStudent(a, studentProfile));
  }, [attempts, studentProfile]);

  const avgScore = useMemo(() => {
    if (myAttempts.length === 0) return 0;
    const sum = myAttempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
    return Math.round(sum / myAttempts.length);
  }, [myAttempts]);

  const activeOrScheduledExams = useMemo(() => {
    return filterExamsForStudent(exams, studentProfile).filter((e) => {
      if (e.deletedAt) return false;
      const s = getEffectiveExamStatus(e);
      return s === "active" || s === "scheduled";
    });
  }, [exams, studentProfile]);

  const assignedResources = useMemo(() => {
    return filterResourcesForStudent(resources, studentProfile);
  }, [resources, studentProfile]);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6 sm:space-y-8 font-sans">
      {/* Student Hero Banner */}
      <motion.div variants={staggerItem}>
        <div className="relative overflow-hidden rounded-xl p-6 sm:p-8 lg:p-10 bg-card border border-border shadow-sm text-foreground">
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-heading text-foreground">
                Welcome back, <span className="text-emerald-400">{studentProfile.name || "Student"}</span>
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground font-normal leading-relaxed">
                Access assigned evaluation papers, study notes for your department, and review real-time academic grade transcripts.
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
              <Link href="/student/exams">
                <Button className="h-11 px-6 rounded-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold transition-all flex items-center gap-2 shadow-none">
                  <PlayCircle className="w-4 h-4 stroke-[2.5]" />
                  <span>Take Assessment</span>
                </Button>
              </Link>
              <Link href="/student/resources">
                <Button variant="outline" className="h-11 px-5 rounded-full border border-border bg-secondary hover:bg-accent text-foreground font-semibold transition-all shadow-none">
                  <BookOpen className="w-4 h-4 mr-2" />
                  <span>Study Notes</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Student Stat Cards Grid */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <motion.div variants={staggerItem}>
          <StatCard
            title="Assigned Assessments"
            value={loading ? 0 : activeOrScheduledExams.length}
            icon={ClipboardList}
            iconClassName="stat-icon-emerald"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Completed Attempts"
            value={loading ? 0 : myAttempts.length}
            icon={Trophy}
            iconClassName="stat-icon-blue"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Average Evaluation Score"
            value={loading ? 0 : avgScore}
            suffix="%"
            icon={TrendingUp}
            iconClassName="stat-icon-amber"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Department Study Notes"
            value={loading ? 0 : assignedResources.length}
            icon={FolderOpen}
            iconClassName="stat-icon-purple"
          />
        </motion.div>
      </motion.div>

      {/* 2-Column Student Section */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active & Scheduled Exams */}
        <motion.div variants={staggerItem} className="lg:col-span-7 space-y-4">
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Assigned Assessment Library</h3>
                  <p className="text-xs text-muted-foreground">Evaluation papers scheduled for your academic cohort</p>
                </div>
              </div>
              <Link href="/student/exams" className="text-xs font-bold text-brand hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {loading || !mounted ? (
                <div className="space-y-3 py-2">
                  <div className="h-16 rounded-xl bg-card/60 border border-border/60 animate-pulse" />
                  <div className="h-16 rounded-xl bg-card/60 border border-border/60 animate-pulse" />
                </div>
              ) : activeOrScheduledExams.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No active assessments scheduled right now.</div>
              ) : (
                activeOrScheduledExams.map((ex) => {
                  const status = getEffectiveExamStatus(ex);
                  const att = myAttempts.find((a) => a.examId === ex.id);
                  return (
                    <div key={ex.id} className="p-4 rounded-xl bg-card/60 border border-border/60 hover:border-brand/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {att ? (
                            <Badge variant="secondary" className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px] font-bold">
                              COMPLETED
                            </Badge>
                          ) : (
                            <Badge variant={status === "active" ? "default" : "secondary"} className={status === "active" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]" : "text-[10px]"}>
                              {status.toUpperCase()}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {ex.duration} mins
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-foreground">{ex.title}</h4>
                        <p className="text-xs text-muted-foreground truncate max-w-sm">{ex.description || "Proctored academic online test."}</p>
                      </div>
                      {att ? (
                        <Link href="/student/results">
                          <Button size="sm" variant="outline" className="w-full sm:w-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-bold text-xs rounded-lg px-4 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Completed ({att.percentage}%)
                          </Button>
                        </Link>
                      ) : status === "active" ? (
                        <Link href={`/student/exams/${ex.id}/take`}>
                          <Button size="sm" className="w-full sm:w-auto bg-brand hover:bg-brand/90 text-brand-foreground font-bold text-xs rounded-lg px-4">
                            Launch Assessment <PlayCircle className="w-3.5 h-3.5 ml-1.5" />
                          </Button>
                        </Link>
                      ) : (
                        <Button disabled size="sm" variant="outline" className="w-full sm:w-auto text-xs rounded-lg px-4 opacity-70">
                          Scheduled
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Right: Recent Attempts Transcript */}
        <motion.div variants={staggerItem} className="lg:col-span-5 space-y-4">
          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">My Recent Evaluations</h3>
                  <p className="text-xs text-muted-foreground">Personal score transcript & answers</p>
                </div>
              </div>
              <Link href="/student/results" className="text-xs font-bold text-brand hover:underline flex items-center gap-1">
                All Scores <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {!mounted ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading your completed tests...</div>
              ) : myAttempts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No tests completed yet. Launch your first assessment above!</div>
              ) : (
                myAttempts.slice(0, 4).map((att) => (
                  <div key={att.id} className="p-3.5 rounded-xl bg-card/60 border border-border/60 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{att.examTitle || "Deleted Assessment"}</h4>
                      <p className="text-xs text-muted-foreground">Submitted: {(() => { const d = toDate(att.submittedAt); return d ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : "Recent"; })()}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-black ${att.passed ? "text-emerald-500" : "text-red-500"}`}>{att.percentage}%</span>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{att.passed ? "PASSED" : "REVIEW"}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const exams = useLMSDataSelector((s) => s.filteredExams);
  const students = useLMSDataSelector((s) => s.filteredStudents);
  const colleges = useLMSDataSelector((s) => s.filteredColleges);
  const resources = useLMSDataSelector((s) => s.filteredResources);
  const attempts = useLMSDataSelector((s) => s.filteredAttempts);
  const batches = useLMSDataSelector((s) => s.filteredBatches);
  const loading = useLMSDataSelector((s) => s.loading);

  const activeStudents = useMemo(() => (students as Student[]).filter((s: Student) => !s.isDeleted), [students]);

  const { branding } = useBranding();
  const mounted = useMounted();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userCollegeId, setUserCollegeId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("User");

  useEffect(() => {
    try {
      const role = localStorage.getItem("lms_role");
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.collegeId) {
          setUserCollegeId(parsed.collegeId);
        }
        if (parsed.role) {
          setUserRole(parsed.role.toLowerCase());
        } else if (role) {
          setUserRole(role.toLowerCase());
        }
        const n = parsed.name || parsed.displayName || "";
        if (parsed.role === "college_admin" || (parsed.collegeId && parsed.collegeId !== "global")) {
          setUserName(n && !n.toLowerCase().includes("admin") ? n : (branding.companyName || parsed.collegeName || "Admin"));
        } else if (n) {
          setUserName(n);
        }
      } else if (role) {
        setUserRole(role.toLowerCase());
      } else {
        setUserRole("student");
      }
    } catch (e) {
      setUserRole("student");
    }
  }, [branding]);

  const displayBatches = useMemo(() => {
    let list = (batches || []) as Batch[];
    if (userRole === "college_admin" && userCollegeId) {
      list = list.filter((b: Batch) => b.collegeId === userCollegeId);
    }
    return list;
  }, [batches, userRole, userCollegeId]);

  const activeOrScheduledExams = useMemo(() => {
    return (exams as Exam[]).filter((e: Exam) => {
      if (e.deletedAt) return false;
      const s = getEffectiveExamStatus(e);
      return s === "active" || s === "scheduled";
    });
  }, [exams]);

  const liveActivity = useMemo(() => {
    return [
      ...activeOrScheduledExams.slice(0, 5).map((ex: Exam) => ({
        id: `ex-${ex.id}`,
        action: getEffectiveExamStatus(ex) === "active" ? "Live Assessment Active" : "Assessment Scheduled",
        detail: `${ex.title} (${ex.duration} mins, ${ex.totalMarks} marks)`,
        time: ex.startTime ? (() => { const d = toDate(ex.startTime); return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Live Now"; })() : "Live Now",
        icon: ClipboardList,
        color: getEffectiveExamStatus(ex) === "active" ? "stat-icon-emerald" : "stat-icon-amber",
      })),
      ...(userRole === "college_admin" ? [] : (colleges as College[]).slice(0, 3).map((c: College) => ({
        id: `col-${c.id}`,
        action: "Partner College Active",
        detail: `${c.name} (${c.code || "Registered"}) linked to portal`,
        time: "Active",
        icon: GraduationCap,
        color: "stat-icon-blue",
      }))),
    ];
  }, [exams, colleges]);

  const dynamicDomainFocus = useMemo(() => {
    const map = new Map<string, number>();
    
    const abbreviateDept = (dept: string) => {
      if (dept === "Artificial Intelligence & Machine Learning (AI & ML)") return "AI & ML";
      if (dept === "Computer Science & Business Systems") return "CS & BS";
      if (dept === "Computer Science & Engineering") return "CS & E";
      if (dept.length > 20) return dept.substring(0, 20) + "...";
      return dept;
    };

    activeStudents.forEach((s: Student) => {
      const dept = abbreviateDept((s as any).department || "General Engineering");
      map.set(dept, (map.get(dept) || 0) + 1);
    });
    if (map.size === 0 && colleges.length > 0) {
      (colleges as College[]).forEach((c: College) => {
        c.departments?.forEach((d: string) => {
          const dept = abbreviateDept(d);
          map.set(dept, (map.get(dept) || 0) + 1);
        });
      });
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [activeStudents, colleges]);

  const dynamicAssessmentAverages = useMemo(() => {
    const titleMap = new Map<string, { totalScore: number; count: number }>();

    (attempts as ExamAttempt[]).forEach((a: ExamAttempt) => {
      const ex = (exams as Exam[]).find((e: Exam) => e.id === a.examId);
      if (!ex) return;
      const title = ex.title;
      if (!titleMap.has(title)) {
        titleMap.set(title, { totalScore: 0, count: 0 });
      }
      const data = titleMap.get(title)!;
      data.totalScore += a.percentage || 0;
      data.count += 1;
    });

    if (titleMap.size === 0) {
      // Fallback if no attempts, just show top 6 unique exams
      const uniqueExams = Array.from(new Map((exams as Exam[]).map((e: Exam) => [e.title, e])).values());
      return uniqueExams.slice(0, 6).map((ex: Exam) => ({
        exam: ex.title.length > 15 ? ex.title.slice(0, 15) + "..." : ex.title,
        score: 0,
      }));
    }

    return Array.from(titleMap.entries())
      .slice(0, 6)
      .map(([title, data]) => ({
        exam: title.length > 15 ? title.slice(0, 15) + "..." : title,
        score: Math.round(data.totalScore / data.count),
      }));
  }, [exams, attempts]);

  const dynamicEnrollmentGrowth = useMemo(() => {
    // Generate monthly count or realistic progression based on actual student count
    const total = activeStudents.length;
    if (total === 0) return [];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return months.map((m, idx) => ({
      month: m,
      students: Math.round((total / 6) * (idx + 1)),
    }));
  }, [activeStudents]);

  if (!mounted || !userRole || userRole === "student") {
    return (
      <StudentPortalDashboard
        exams={exams as Exam[]}
        resources={resources as Resource[]}
        attempts={attempts as ExamAttempt[]}
        students={students as Student[]}
        loading={loading}
      />
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-[1400px] mx-auto w-full font-sans"
    >
      {/* Header Section */}
      <motion.div variants={staggerItem} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 mt-2">
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-heading flex items-center gap-3">
            Welcome back, {userName}!
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 ml-1 hidden sm:block">
              <div className="absolute inset-0 bg-emerald-400 rounded-lg -rotate-12 transform origin-bottom-left shadow-sm"></div>
              <div className="absolute inset-0 bg-rose-500 rounded-lg rotate-0 transform origin-bottom-left shadow-sm"></div>
              <div className="absolute inset-0 bg-blue-500 rounded-lg rotate-12 transform origin-bottom-left shadow-sm"></div>
            </div>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground italic">
            "The art of teaching is the art of assisting discovery." — Mark Van Doren
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
          <Link href="/students" passHref>
            <Button
              variant="ghost"
              className="h-11 px-5 rounded-xl border border-border bg-transparent text-foreground hover:bg-accent font-semibold transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">Students</span>
            </Button>
          </Link>
          <Link href="/admin/exams" passHref>
            <Button
              className="h-11 px-5 rounded-xl bg-brand hover:bg-brand/90 text-primary-foreground font-bold transition-all flex items-center justify-center gap-2 shadow-sm border border-white/20 dark:border-black/10 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 stroke-[3] shrink-0" />
              <span className="whitespace-nowrap">Create Assessment</span>
            </Button>
          </Link>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <motion.div variants={staggerItem}>
          <Link href="/admin/exams" className="block">
            <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-emerald-500/50 transition-colors cursor-pointer group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">My Assessments</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-heading">{loading ? "0" : exams.length}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Total overall assignments</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
              </div>
            </div>
          </GlassCard>
          </Link>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Link href="/admin/students" className="block">
            <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Students</span>
              <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                <GraduationCap className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-heading">{loading ? "0" : activeStudents.length}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">
                  {userRole === "admin" ? "Across all colleges" : userRole === "college_admin" ? "In your college" : "In your batches"}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </GlassCard>
          </Link>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Link href="/admin/exams" className="block">
            <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Active Assignments</span>
              <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                <ClipboardList className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-heading">{loading ? "0" : activeOrScheduledExams.length}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Currently running</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </GlassCard>
          </Link>
        </motion.div>

        <motion.div variants={staggerItem}>
          <Link href="/admin/resources" className="block">
            <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Shared Resources</span>
              <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                <Library className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-heading">{loading ? "0" : resources.length}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Total study materials</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </GlassCard>
          </Link>
        </motion.div>
      </motion.div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Quick Actions (Left Column) */}
        <motion.div variants={staggerContainer} className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card/50 shadow-sm p-6 h-full flex flex-col">
            <h2 className="text-xl font-bold font-heading mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            <Link 
              href="/admin/exams"
              className="p-6 h-36 rounded-2xl bg-purple-500/5 border border-purple-500/20 flex flex-col justify-between cursor-pointer hover:bg-purple-500/10 transition-colors group block"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm text-foreground">Create Assessment</span>
            </Link>

            <Link 
              href="/admin/resources"
              className="p-6 h-36 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex flex-col justify-between cursor-pointer hover:bg-blue-500/10 transition-colors group block"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FolderOpen className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm text-foreground">Share Resources</span>
            </Link>

            <Link 
              href="/admin/students"
              className="p-6 h-36 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col justify-between cursor-pointer hover:bg-emerald-500/10 transition-colors group block"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm text-foreground">View Students</span>
            </Link>
          </div>
          </div>
        </motion.div>

        {/* My Batches (Right Column) */}
        <motion.div variants={staggerItem} className="lg:col-span-1">
          <div className="rounded-2xl border border-border bg-card/50 shadow-sm p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold font-heading">My Batches</h2>
              <Link href="/admin/batches" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                View All
              </Link>
            </div>
            <div className="space-y-3 flex-1">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading batches...</div>
            ) : displayBatches.length === 0 ? (
              <GlassCard className="p-6 text-center text-xs text-muted-foreground">
                No batches found.
              </GlassCard>
            ) : (
              displayBatches.slice(0, 5).map((batch: Batch) => {
                const college = (colleges as College[]).find((c: College) => c.id === batch.collegeId);
                const batchStudents = (students as Student[]).filter((s: Student) => s.batchIds?.includes(batch.id)).length;
                return (
                  <GlassCard key={batch.id} className="p-4 hover:border-border transition-colors flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{batch.name}</h4>
                      <div className="text-xs font-semibold text-brand mt-0.5 truncate">{college?.name || "No College Assigned"}</div>
                      {batch.department && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{batch.department}</div>
                      )}
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-2">
                        <Users className="w-3.5 h-3.5" />
                        {batchStudents} students
                      </div>
                    </div>
                    <div className="self-start">
                      <Badge variant="secondary" className="text-[10px] bg-secondary text-secondary-foreground font-semibold">
                        {batch.academicYear || new Date().getFullYear()}
                      </Badge>
                    </div>
                  </GlassCard>
                );
              })
            )}
            </div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
