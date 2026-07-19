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
  FilePlus
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/shared/stat-card";
import { GlassCard } from "@/components/shared/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { getAllExamsIncludingDeleted, getAllStudents, getAllColleges, getAllResources, getEffectiveExamStatus, getStudentAttempts, filterResourcesForStudent, filterExamsForStudent, getAllBatches } from "@/lib/services";
import { toDate } from "@/lib/utils/date";
import type { Exam, Student, College, Resource, ExamAttempt, Batch, AssignmentTarget } from "@/types";

function StudentPortalDashboard({
  exams,
  resources,
  attempts,
  loading,
}: {
  exams: Exam[];
  resources: Resource[];
  attempts: ExamAttempt[];
  loading: boolean;
}) {
  const [studentProfile, setStudentProfile] = useState<any>(() => {
    try {
      if (typeof window !== "undefined") {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) return JSON.parse(uStr);
      }
    } catch (_) {}
    return { id: "", name: "", email: "", department: "", rollNumber: "", batchIds: [] };
  });

  useEffect(() => {
    const updateProfile = () => {
      try {
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) {
          const parsed = JSON.parse(uStr);
          setStudentProfile(parsed);
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
  }, []);



  const myAttempts = useMemo(() => {
    return attempts.filter((a) => {
      const sId = studentProfile?.id;
      const sEmail = (studentProfile?.email || "").toLowerCase().trim();

      if (sId && (a.studentId === sId || a.studentId?.toLowerCase() === sEmail)) return true;
      if (sEmail && (a.studentId?.toLowerCase() === sEmail || (a as any).studentEmail?.toLowerCase() === sEmail)) return true;

      return false;
    });
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
              <Link href="/exams">
                <Button className="h-11 px-6 rounded-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold transition-all flex items-center gap-2 shadow-none">
                  <PlayCircle className="w-4 h-4 stroke-[2.5]" />
                  <span>Take Assessment</span>
                </Button>
              </Link>
              <Link href="/resources">
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
              <Link href="/exams" className="text-xs font-bold text-brand hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {activeOrScheduledExams.length === 0 ? (
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
                        <Link href="/results">
                          <Button size="sm" variant="outline" className="w-full sm:w-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-bold text-xs rounded-lg px-4 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Completed ({att.percentage}%)
                          </Button>
                        </Link>
                      ) : status === "active" ? (
                        <Link href={`/exams/${ex.id}/take`}>
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
              <Link href="/results" className="text-xs font-bold text-brand hover:underline flex items-center gap-1">
                All Scores <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {myAttempts.length === 0 ? (
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
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("admin");
  const [userName, setUserName] = useState<string>("Trainer");

  useEffect(() => {
    try {
      const role = localStorage.getItem("lms_role") || "admin";
      setUserRole(role.toLowerCase());
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.name || parsed.displayName) {
          setUserName((parsed.name || parsed.displayName).split(" ")[0]);
        }
      }
    } catch (e) {}

    async function loadLivePortal() {
      setLoading(true);
      try {
        const [ex, st, cl, rs, att, b] = await Promise.all([
          getAllExamsIncludingDeleted(),
          getAllStudents(),
          getAllColleges(),
          getAllResources(),
          getStudentAttempts(),
          getAllBatches(),
        ]);
        
        let filteredStudents = st || [];
        let filteredExams = ex || [];
        let filteredAttempts = att || [];
        let filteredColleges = cl || [];

        try {
          const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
          if (uStr) {
            const parsed = JSON.parse(uStr);
            if (parsed.role === "college_admin" && parsed.collegeId) {
              filteredColleges = filteredColleges.filter(c => c.id === parsed.collegeId);
              filteredStudents = filteredStudents.filter((s: Student) => s.collegeId === parsed.collegeId);
              const validStudentIds = new Set(filteredStudents.map((s: Student) => s.id));
              const validBatchIds = new Set(filteredStudents.flatMap((s: Student) => s.batchIds || []));
              
              filteredExams = filteredExams.filter((e: Exam) => {
                if (!e.targets) return false;
                return e.targets.some(t => {
                  if (t.type === "composite") {
                    return t.collegeId === parsed.collegeId || (t.batchId && validBatchIds.has(t.batchId));
                  }
                  if (t.type === "college") return t.ids.includes(parsed.collegeId);
                  if (t.type === "batch") return t.ids.some(b => validBatchIds.has(b));
                  if (t.type === "students") return t.ids.some(s => validStudentIds.has(s));
                  return false;
                });
              });
              
              filteredAttempts = filteredAttempts.filter((a: ExamAttempt) => validStudentIds.has(a.studentId));
              
              const rsArray = rs || [];
              const filteredRs = rsArray.filter((res: Resource) => {
                if (!res.targets) return false;
                return res.targets.some((t: AssignmentTarget) => {
                  if (t.type === "composite") {
                    return t.collegeId === parsed.collegeId || (t.batchId && validBatchIds.has(t.batchId));
                  }
                  if (t.type === "college") return t.ids?.includes(parsed.collegeId);
                  if (t.type === "batch") return t.ids?.some((b: string) => validBatchIds.has(b));
                  if (t.type === "students") return t.ids?.some((s: string) => validStudentIds.has(s));
                  return false;
                });
              });
              setResources(filteredRs);
            } else {
              setResources(rs || []);
            }
          } else {
            setResources(rs || []);
          }
        } catch (_) {
          setResources(rs || []);
        }

        setExams(filteredExams);
        setStudents(filteredStudents);
        setColleges(filteredColleges);
        setAttempts(filteredAttempts);
        setBatches(b || []);
      } catch (err) {
        console.error("Failed loading live portal data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadLivePortal();
  }, []);

  const activeOrScheduledExams = useMemo(() => {
    return exams.filter((e) => {
      if (e.deletedAt) return false;
      const s = getEffectiveExamStatus(e);
      return s === "active" || s === "scheduled";
    });
  }, [exams]);

  const liveActivity = useMemo(() => {
    return [
      ...exams.slice(0, 5).map((ex) => ({
        id: `ex-${ex.id}`,
        action: getEffectiveExamStatus(ex) === "active" ? "Live Assessment Active" : "Assessment Scheduled",
        detail: `${ex.title} (${ex.duration} mins, ${ex.totalMarks} marks)`,
        time: ex.startTime ? (() => { const d = toDate(ex.startTime); return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Live Now"; })() : "Live Now",
        icon: ClipboardList,
        color: getEffectiveExamStatus(ex) === "active" ? "stat-icon-emerald" : "stat-icon-amber",
      })),
      ...(userRole === "college_admin" ? [] : colleges.slice(0, 3).map((c) => ({
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

    students.forEach((s) => {
      const dept = abbreviateDept((s as any).department || "General Engineering");
      map.set(dept, (map.get(dept) || 0) + 1);
    });
    if (map.size === 0 && colleges.length > 0) {
      colleges.forEach((c) => {
        c.departments?.forEach((d) => {
          const dept = abbreviateDept(d);
          map.set(dept, (map.get(dept) || 0) + 1);
        });
      });
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [students, colleges]);

  const dynamicAssessmentAverages = useMemo(() => {
    const titleMap = new Map<string, { totalScore: number; count: number }>();

    attempts.forEach((a) => {
      const ex = exams.find((e) => e.id === a.examId);
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
      const uniqueExams = Array.from(new Map(exams.map((e) => [e.title, e])).values());
      return uniqueExams.slice(0, 6).map((ex) => ({
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
    const total = students.length;
    if (total === 0) return [];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return months.map((m, idx) => ({
      month: m,
      students: Math.round((total / 6) * (idx + 1)),
    }));
  }, [students]);

  if (userRole === "student") {
    return (
      <StudentPortalDashboard
        exams={exams}
        resources={resources}
        attempts={attempts}
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
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="ghost"
            onClick={() => router.push("/admin/students")}
            className="h-11 px-5 rounded-xl border border-border bg-transparent text-foreground hover:bg-accent font-semibold transition-all flex items-center gap-2"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Students</span>
          </Button>
          <Button
            onClick={() => router.push("/admin/exams")}
            className="h-11 px-5 rounded-xl bg-brand hover:bg-brand/90 text-primary-foreground font-bold transition-all flex items-center gap-2 shadow-sm border border-white/20 dark:border-black/10"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Create Assessment</span>
          </Button>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <motion.div variants={staggerItem}>
          <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-emerald-500/50 transition-colors cursor-pointer group" onClick={() => router.push("/admin/exams")}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">My Assessments</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-heading">{loading ? "0" : exams.length}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Created by you</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div variants={staggerItem}>
          <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group" onClick={() => router.push("/admin/students")}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Students</span>
              <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                <GraduationCap className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-heading">{loading ? "0" : students.length}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">In your batches</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div variants={staggerItem}>
          <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group" onClick={() => router.push("/admin/exams")}>
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
        </motion.div>

        <motion.div variants={staggerItem}>
          <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Pending Reviews</span>
              <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold font-heading">0</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Awaiting evaluation</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Quick Actions (Left Column) */}
        <motion.div variants={staggerContainer} className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card/50 shadow-sm p-6 h-full flex flex-col">
            <h2 className="text-xl font-bold font-heading mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            <div 
              className="p-6 h-36 rounded-2xl bg-purple-500/5 border border-purple-500/20 flex flex-col justify-between cursor-pointer hover:bg-purple-500/10 transition-colors group"
              onClick={() => router.push("/admin/exams")}
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm text-foreground">Create Assessment</span>
            </div>

            <div 
              className="p-6 h-36 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex flex-col justify-between cursor-pointer hover:bg-blue-500/10 transition-colors group"
              onClick={() => router.push("/admin/resources")}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FolderOpen className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm text-foreground">Share Resources</span>
            </div>

            <div 
              className="p-6 h-36 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col justify-between cursor-pointer hover:bg-emerald-500/10 transition-colors group"
              onClick={() => router.push("/admin/students")}
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <GraduationCap className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm text-foreground">View Students</span>
            </div>
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
            ) : batches.length === 0 ? (
              <GlassCard className="p-6 text-center text-xs text-muted-foreground">
                No batches found.
              </GlassCard>
            ) : (
              batches.slice(0, 5).map(batch => {
                const college = colleges.find(c => c.id === batch.collegeId);
                const batchStudents = students.filter(s => s.batchIds?.includes(batch.id)).length;
                return (
                  <GlassCard key={batch.id} className="p-4 hover:border-border transition-colors flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{batch.name}</h4>
                      <div className="text-xs text-muted-foreground mt-0.5">{college?.code || "College"}</div>
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
