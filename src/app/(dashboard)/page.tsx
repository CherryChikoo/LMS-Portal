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
  CheckCircle2,
  TrendingUp,
  PlayCircle,
  Plus,
  Trophy,
  BookOpen,
  Building2,
  Layers,
  Library,
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/shared/stat-card";
import { GlassCard } from "@/components/shared/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useRef } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { formatDisplayName } from "@/lib/utils";
import { useBranding } from "@/providers/branding-provider";
import {
  getAdminDashboardStatsAction,
  getStudentDashboardStatsAction,
  getCollegeAdminDashboardStatsAction,
  getRecentActivityAction,
  getCollegeRecentActivityAction,
} from "@/lib/actions/dashboard-actions-optimized";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";

// ============================================================================
// STUDENT DASHBOARD (OLD DESIGN + SERVER DATA)
// ============================================================================
function StudentPortalDashboard({ stats, loading }: { stats: any; loading: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>({ 
    id: "", name: "", email: "", displayName: ""
  });
  const [filteredAttempts, setFilteredAttempts] = useState<any[]>([]);

  const filteredExams = useLMSDataSelector(state => state.filteredExams);
  const filteredResources = useLMSDataSelector(state => state.filteredResources);
  const lmsLoading = useLMSDataSelector(state => state.loading);

  const rawExams = useLMSDataSelector(state => state.exams);
  const rawResources = useLMSDataSelector(state => state.resources);
  
  useEffect(() => {
    setMounted(true);
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        setStudentProfile(parsed);
        console.log('[DEBUG] Student profile:', parsed);
        console.log('[DEBUG] Total raw exams in cache:', rawExams?.length);
        console.log('[DEBUG] Filtered exams for student:', filteredExams?.length);
        console.log('[DEBUG] Total raw resources in cache:', rawResources?.length);
        console.log('[DEBUG] Filtered resources for student:', filteredResources?.length);
        
        // Fetch student attempts separately
        const sId = parsed.id || parsed.uid;
        const sEmail = parsed.email;
        if (sId) {
          import("@/lib/services").then(({ getStudentAttemptsForCurrentUser }) => {
            getStudentAttemptsForCurrentUser(sId, sEmail).then((attempts) => {
              console.log('[DEBUG] Loaded student attempts:', attempts?.length);
              setFilteredAttempts(attempts || []);
            }).catch((err) => {
              console.error('[DEBUG] Failed to load attempts:', err);
              setFilteredAttempts([]);
            });
          });
        }
      }
    } catch (_) {}
  }, [filteredExams, filteredResources, rawExams, rawResources]);

  // Use client-side filtered data for accuracy
  const assignedExamsCount = filteredExams?.length || 0;
  const assignedResourcesCount = filteredResources?.length || 0;
  
  const completedAttempts = filteredAttempts?.filter(a => a.status === "completed" || a.status === "graded" || a.status === "submitted") || [];
  const completedAttemptsCount = completedAttempts.length;
  const averageScore = completedAttemptsCount > 0 
    ? Math.round(completedAttempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / completedAttemptsCount)
    : 0;
  const recentAttempts = [...completedAttempts].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 5);
    
  const isDataLoading = loading || lmsLoading;

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6 sm:space-y-8 font-sans">
      {/* Student Hero Banner */}
      <motion.div variants={staggerItem}>
        <div className="relative overflow-hidden rounded-xl p-6 sm:p-8 lg:p-10 bg-card border border-border shadow-sm text-foreground">
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-heading text-foreground">
                Welcome back, <span className="text-emerald-400">{formatDisplayName(studentProfile.displayName || studentProfile.name || "Student")}</span>
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
            value={isDataLoading ? 0 : assignedExamsCount}
            icon={ClipboardList}
            iconClassName="stat-icon-emerald"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Completed Attempts"
            value={isDataLoading ? 0 : completedAttemptsCount}
            icon={Trophy}
            iconClassName="stat-icon-blue"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Average Evaluation Score"
            value={isDataLoading ? 0 : averageScore}
            suffix="%"
            icon={TrendingUp}
            iconClassName="stat-icon-amber"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Department Study Notes"
            value={isDataLoading ? 0 : assignedResourcesCount}
            icon={FolderOpen}
            iconClassName="stat-icon-purple"
          />
        </motion.div>
      </motion.div>

      {/* Recent Attempts */}
      {recentAttempts && recentAttempts.length > 0 && (
        <motion.div variants={staggerItem}>
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
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
              {recentAttempts.map((att: any) => (
                <div key={att.id} className="p-3.5 rounded-xl bg-card/60 border border-border/60 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{att.examTitle || "Assessment"}</h4>
                    <p className="text-xs text-muted-foreground">
                      {new Date(att.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-black ${att.percentage >= 40 ? "text-emerald-500" : "text-red-500"}`}>
                      {att.percentage}%
                    </span>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {att.percentage >= 40 ? "Pass" : "Fail"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================================
// ADMIN DASHBOARD (OLD DESIGN + SERVER DATA)
// ============================================================================
function AdminDashboard({ stats, recentActivity, userName, userRole, userCollegeId }: any) {
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
            Welcome back, {formatDisplayName(userName)}!
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
          <Link href="/admin/students" passHref>
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

      {/* Stats Grid */}
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
                <div className="text-3xl font-bold font-heading">{(stats?.exams?.total || 0).toLocaleString()}</div>
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
                <div className="text-3xl font-bold font-heading">{(stats?.students?.total || 0).toLocaleString()}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {userRole === "admin" || userRole === "main_admin" || userRole === "super_admin" 
                      ? "Across all colleges" 
                      : "In your college"}
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
                <div className="text-3xl font-bold font-heading">{(stats?.exams?.active || 0).toLocaleString()}</div>
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
                <div className="text-3xl font-bold font-heading">{(stats?.resources?.total || 0).toLocaleString()}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">Total study materials</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </GlassCard>
          </Link>
        </motion.div>
      </motion.div>

      {/* Secondary Stats Row */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {userRole !== "college_admin" && (
          <motion.div variants={staggerItem}>
            <Link href="/admin/colleges" className="block">
              <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Total Colleges</span>
                  <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-bold font-heading">{(stats?.colleges?.total || 0).toLocaleString()}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">Partner institutions</span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </GlassCard>
            </Link>
          </motion.div>
        )}
        <motion.div variants={staggerItem}>
          <Link href="/admin/batches" className="block">
            <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Total Batches</span>
                <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold font-heading">{(stats?.batches?.total || 0).toLocaleString()}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">Student groups</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </GlassCard>
          </Link>
        </motion.div>
        <motion.div variants={staggerItem}>
          <Link href="/admin/results" className="block">
            <GlassCard className="p-6 flex flex-col justify-between h-36 hover:border-muted-foreground/50 transition-colors cursor-pointer group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Total Attempts</span>
                <div className="w-9 h-9 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center border border-border/50">
                  <Trophy className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold font-heading">{(stats?.attempts?.total || 0).toLocaleString()}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{stats?.attempts?.completionRate || 0}% completion rate</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </GlassCard>
          </Link>
        </motion.div>
      </motion.div>

      {/* Main Content Area - 2 Column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Quick Actions (Left Column - 2/3 width) */}
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

        {/* My Batches (Right Column - 1/3 width) */}
        <motion.div variants={staggerItem} className="lg:col-span-1">
          <div className="rounded-2xl border border-border bg-card/50 shadow-sm p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold font-heading">My Batches</h2>
              <Link href="/admin/batches" className="text-xs font-bold text-brand hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-4 flex-1 max-h-[360px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-border/60 hover:scrollbar-thumb-border">
              {recentActivity?.recentBatches && recentActivity.recentBatches.length > 0 ? (
                recentActivity.recentBatches.map((batch: any) => (
                  <Link key={batch.id} href={`/admin/batches/${batch.id}`} className="block">
                    <GlassCard className="p-4 hover:border-border transition-colors cursor-pointer group">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-sm text-foreground truncate flex-1">
                          {batch.name}
                        </h4>
                        <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
                          {batch.academicYear || new Date().getFullYear()}
                        </Badge>
                      </div>
                      <div className="text-xs text-brand font-semibold truncate mb-1">
                        {batch.colleges?.name || "No College"}
                      </div>
                      {batch.department && (
                        <div className="text-[11px] text-muted-foreground truncate mb-2">
                          {batch.department}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {(batch._count?.student_batches || batch._count?.students || 0).toLocaleString()} students
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-brand transition-colors" />
                      </div>
                    </GlassCard>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No batches found
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function DashboardPageOptimized() {
  const router = useRouter();
  const { branding } = useBranding();
  const mounted = useMounted();
  
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userCollegeId, setUserCollegeId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("User");
  // Removed lastRefreshTimestamp - it was causing infinite refresh loops
  
  const [stats, setStats] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user data
  useEffect(() => {
    const syncUser = () => {
      try {
        const role = localStorage.getItem("lms_role");
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) {
          const parsed = JSON.parse(uStr);
          
          // For students, try multiple ID sources in priority order
          const extractedUserId = parsed.id || parsed.uid || parsed.authId || parsed.email || "";
          console.log('[DASHBOARD] Extracted userId:', extractedUserId, 'from parsed:', { id: parsed.id, uid: parsed.uid, authId: parsed.authId, email: parsed.email });
          setUserId(extractedUserId);
          setUserCollegeId(parsed.collegeId || null);
          
          if (parsed.role) {
            setUserRole(parsed.role.toLowerCase());
          } else if (role) {
            setUserRole(role.toLowerCase());
          }
          
          const n = parsed.displayName || parsed.name || "";
          if (n) {
            setUserName(formatDisplayName(n));
          } else if (parsed.role === "college_admin" || (parsed.collegeId && parsed.collegeId !== "global")) {
            setUserName(parsed.collegeName || branding.companyName || "Admin");
          } else {
            setUserName(branding.companyName || "Admin");
          }
        } else if (role) {
          setUserRole(role.toLowerCase());
        } else {
          setUserRole("student");
        }
      } catch (e) {
        console.error('[DASHBOARD] Error syncing user:', e);
        setUserRole("student");
      }
    };

    syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener("pageshow", syncUser);
    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("pageshow", syncUser);
    };
  }, [branding]);

  // Dashboard Refresh Policy: Update specific counts locally instead of a full dashboard refresh
  const localCollegesCount = useLMSDataSelector((s) => s.filteredColleges.length);
  const localBatchesCount = useLMSDataSelector((s) => s.filteredBatches.length);
  const localExamsCount = useLMSDataSelector((s) => s.filteredExams.length);
  const localResourcesCount = useLMSDataSelector((s) => s.filteredResources.length);
  const localStudentsCount = useLMSDataSelector((s) => s.filteredStudents.length);
  // Dashboard Refresh Policy: Load dashboard stats on mount and whenever the background cache refreshes
  useEffect(() => {
    // For admin roles, we don't need userId
    const isAdminRole = userRole === "admin" || userRole === "super_admin" || userRole === "main_admin";
    const canLoad = mounted && userRole && (isAdminRole || userId);
    
    if (!canLoad) {
      console.log('[DASHBOARD] Cannot load - mounted:', mounted, 'userRole:', userRole, 'userId:', userId);
      return;
    }
    
    const loadStats = async () => {
      // Intentionally NOT setting loading to true here.
      // Initial loading state is already true. Background refreshes should update silently.
      setError(null);
      
      try {
        console.log('[DASHBOARD] Loading stats for role:', userRole);
        
        if (isAdminRole) {
          const [statsResult, activityResult] = await Promise.all([
            getAdminDashboardStatsAction(),
            getRecentActivityAction(10),
          ]);
          
          console.log('[DASHBOARD] Stats result:', statsResult);
          console.log('[DASHBOARD] Activity result:', activityResult);
          
          if (statsResult.success) {
            console.log('[DASHBOARD] Setting stats:', statsResult.stats);
            setStats(statsResult.stats);
          } else {
            console.error('[DASHBOARD] Stats load failed:', statsResult.error);
            setError(statsResult.error || "Failed to load dashboard stats");
          }
          
          if (activityResult.success) {
            console.log('[DASHBOARD] Recent batches:', activityResult.data?.recentBatches);
            setRecentActivity(activityResult.data);
          }
        } else if (userRole === "college_admin" || userRole === "college") {
          const [statsResult, activityResult] = await Promise.all([
            getCollegeAdminDashboardStatsAction(userCollegeId || ""),
            getCollegeRecentActivityAction(userCollegeId || "", 10),
          ]);
          
          if (statsResult.success) {
            setStats(statsResult.stats);
          } else {
            setError(statsResult.error || "Failed to load college dashboard stats");
          }
          
          if (activityResult.success) {
            setRecentActivity(activityResult.data);
          }
        } else if (userRole === "student") {
          console.log('[DASHBOARD] Loading student stats for userId:', userId);
          
          if (!userId) {
            console.error('[DASHBOARD] No userId available for student');
            setError("Unable to load dashboard: Student ID not found");
            return;
          }
          
          const statsResult = await getStudentDashboardStatsAction(userId);
          
          console.log('[DASHBOARD] Student stats result:', statsResult);
          
          if (statsResult.success) {
            setStats(statsResult.stats);
          } else {
            console.error('[DASHBOARD] Student stats load failed:', statsResult.error);
            setError(statsResult.error || "Failed to load student dashboard stats");
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };
    
    loadStats();
  }, [mounted, userId, userRole, userCollegeId]); // Removed lastRefreshTimestamp to prevent constant reloading
  // Loading state
  if (!mounted || loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-card rounded-xl border border-border animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-card rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-destructive/10 border border-destructive rounded-xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-destructive mb-1">Dashboard Load Error</h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline" 
                size="sm"
              >
                Reload Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render based on role
  if (userRole === "student") {
    return <StudentPortalDashboard stats={stats} loading={loading} />;
  } else {
    return (
      <AdminDashboard 
        stats={stats} 
        recentActivity={recentActivity} 
        userName={userName}
        userRole={userRole}
        userCollegeId={userCollegeId}
      />
    );
  }
}
