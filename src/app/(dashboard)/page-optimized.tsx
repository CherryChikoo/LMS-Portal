"use client";

import { motion } from "motion/react";
import {
  Users,
  GraduationCap,
  ClipboardList,
  FolderOpen,
  Trophy,
  TrendingUp,
  PlayCircle,
  BookOpen,
  Building2,
  Layers,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/shared/stat-card";
import { GlassCard } from "@/components/shared/glass-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { formatDisplayName } from "@/lib/utils";
import {
  getAdminDashboardStatsAction,
  getStudentDashboardStatsAction,
  getCollegeAdminDashboardStatsAction,
  getRecentActivityAction,
} from "@/lib/actions/dashboard-actions-optimized";
import { Badge } from "@/components/ui/badge";
import { useBranding } from "@/providers/branding-provider";

export default function DashboardPageOptimized() {
  const router = useRouter();
  const { branding } = useBranding();
  
  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string>("student");
  const [userId, setUserId] = useState<string>("");
  const [userCollegeId, setUserCollegeId] = useState<string>("");
  const [userName, setUserName] = useState<string>("User");
  
  const [stats, setStats] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load user info from localStorage (client-side only)
  useEffect(() => {
    setMounted(true);
    
    const loadUserData = () => {
      if (typeof window === "undefined") return;
      
      try {
        const role = localStorage.getItem("lms_role") || "student";
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        
        if (uStr) {
          const parsed = JSON.parse(uStr);
          setUserRole(role.toLowerCase());
          setUserId(parsed.id || parsed.uid || "");
          setUserCollegeId(parsed.collegeId || "");
          setUserName(parsed.name || parsed.displayName || "User");
        }
      } catch (err) {
        console.error("Failed to load user data:", err);
      }
    };
    
    loadUserData();
  }, []);

  // Load dashboard stats based on role
  useEffect(() => {
    if (!mounted || !userId) return;
    
    const loadStats = async () => {
      setLoading(true);
      
      try {
        if (userRole === "admin" || userRole === "super_admin") {
          const [statsResult, activityResult] = await Promise.all([
            getAdminDashboardStatsAction(),
            getRecentActivityAction(10),
          ]);
          
          if (statsResult.success) {
            setStats(statsResult.stats);
          }
          
          if (activityResult.success) {
            setRecentActivity(activityResult.data);
          }
        } else if (userRole === "college_admin" || userRole === "college") {
          const statsResult = await getCollegeAdminDashboardStatsAction(userCollegeId);
          
          if (statsResult.success) {
            setStats(statsResult.stats);
          }
        } else if (userRole === "student") {
          const statsResult = await getStudentDashboardStatsAction(userId);
          
          if (statsResult.success) {
            setStats(statsResult.stats);
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    };
    
    loadStats();
  }, [mounted, userId, userRole, userCollegeId]);

  // Show loading state during SSR and initial load
  if (!mounted || loading || !stats) {
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

  // Render based on role
  if (userRole === "student") {
    return <StudentDashboard stats={stats} userName={userName} />;
  } else if (userRole === "college_admin" || userRole === "college") {
    return <CollegeAdminDashboard stats={stats} userName={userName} />;
  } else {
    return <AdminDashboard stats={stats} recentActivity={recentActivity} userName={userName} />;
  }
}

// ============================================================================
// STUDENT DASHBOARD
// ============================================================================

function StudentDashboard({ stats, userName }: { stats: any; userName: string }) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6 sm:space-y-8">
      {/* Hero Banner */}
      <motion.div variants={staggerItem}>
        <div className="relative overflow-hidden rounded-xl p-6 sm:p-8 lg:p-10 bg-card border border-border shadow-sm">
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
                Welcome back, <span className="text-emerald-400">{formatDisplayName(userName)}</span>
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Access assigned evaluation papers, study notes, and review your academic performance.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link href="/student/exams">
                <Button className="h-11 px-6 rounded-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold">
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Take Assessment
                </Button>
              </Link>
              <Link href="/student/resources">
                <Button variant="outline" className="h-11 px-5 rounded-full">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Study Notes
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={staggerItem}>
          <StatCard
            title="Assigned Assessments"
            value={stats.assignedExams || 0}
            icon={ClipboardList}
            iconClassName="stat-icon-emerald"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Completed Attempts"
            value={stats.completedAttempts || 0}
            icon={Trophy}
            iconClassName="stat-icon-blue"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Average Score"
            value={stats.averageScore || 0}
            suffix="%"
            icon={TrendingUp}
            iconClassName="stat-icon-amber"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Study Resources"
            value={stats.assignedResources || 0}
            icon={FolderOpen}
            iconClassName="stat-icon-purple"
          />
        </motion.div>
      </motion.div>

      {/* Recent Attempts */}
      {stats.recentAttempts && stats.recentAttempts.length > 0 && (
        <motion.div variants={staggerItem}>
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Recent Attempts</h2>
              <Link href="/student/results">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            </div>
            <div className="space-y-3">
              {stats.recentAttempts.map((attempt: any) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{attempt.exams?.title || "Exam"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(attempt.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={attempt.status === "completed" ? "default" : "secondary"}>
                    {attempt.percentage || 0}%
                  </Badge>
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
// COLLEGE ADMIN DASHBOARD
// ============================================================================

function CollegeAdminDashboard({ stats, userName }: { stats: any; userName: string }) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* Hero */}
      <motion.div variants={staggerItem}>
        <div className="bg-card rounded-xl p-6 border border-border">
          <h1 className="text-3xl font-bold">
            Welcome, <span className="text-brand">{formatDisplayName(userName)}</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your college students, batches, and assessments.
          </p>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Students"
            value={stats.students?.total || 0}
            icon={Users}
            iconClassName="stat-icon-emerald"
            trend={stats.students?.recent > 0 ? { value: stats.students.recent, isPositive: true } : undefined}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Active Students"
            value={stats.students?.active || 0}
            icon={CheckCircle2}
            iconClassName="stat-icon-blue"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Batches"
            value={stats.batches?.total || 0}
            icon={Layers}
            iconClassName="stat-icon-amber"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Assessments"
            value={stats.exams?.total || 0}
            icon={ClipboardList}
            iconClassName="stat-icon-purple"
            trend={stats.exams?.recent > 0 ? { value: stats.exams.recent, isPositive: true } : undefined}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// ADMIN DASHBOARD
// ============================================================================

function AdminDashboard({ stats, recentActivity, userName }: { stats: any; recentActivity: any; userName: string }) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* Hero */}
      <motion.div variants={staggerItem}>
        <div className="bg-card rounded-xl p-6 border border-border">
          <h1 className="text-3xl font-bold">
            Welcome, <span className="text-brand">{formatDisplayName(userName)}</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Complete system overview and management dashboard.
          </p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Students"
            value={stats.students?.total || 0}
            icon={Users}
            iconClassName="stat-icon-emerald"
            trend={stats.students?.recent > 0 ? { value: stats.students.recent, isPositive: true } : undefined}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Colleges"
            value={stats.colleges?.total || 0}
            icon={Building2}
            iconClassName="stat-icon-blue"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Assessments"
            value={stats.exams?.total || 0}
            icon={ClipboardList}
            iconClassName="stat-icon-amber"
            trend={stats.exams?.recent > 0 ? { value: stats.exams.recent, isPositive: true } : undefined}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Attempts"
            value={stats.attempts?.total || 0}
            icon={Trophy}
            iconClassName="stat-icon-purple"
            trend={{ value: stats.attempts?.completionRate || 0, isPositive: true }}
          />
        </motion.div>
      </motion.div>

      {/* Secondary Stats */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div variants={staggerItem}>
          <StatCard
            title="Active Exams"
            value={stats.exams?.active || 0}
            icon={Clock}
            iconClassName="stat-icon-green"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Resources"
            value={stats.resources?.total || 0}
            icon={FolderOpen}
            iconClassName="stat-icon-indigo"
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            title="Total Batches"
            value={stats.batches?.total || 0}
            icon={Layers}
            iconClassName="stat-icon-rose"
          />
        </motion.div>
      </motion.div>

      {/* Recent Activity */}
      {recentActivity && (
        <motion.div variants={staggerItem}>
          <GlassCard className="p-6">
            <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
            
            <div className="space-y-4">
              {/* Recent Students */}
              {recentActivity.recentStudents && recentActivity.recentStudents.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Recent Enrollments</h3>
                  <div className="space-y-2">
                    {recentActivity.recentStudents.slice(0, 3).map((student: any) => (
                      <div key={student.id} className="flex items-center justify-between p-2 rounded bg-background/50">
                        <div>
                          <p className="text-sm font-medium">{student.users?.displayName || "Student"}</p>
                          <p className="text-xs text-muted-foreground">{student.colleges?.name || "N/A"}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(student.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      )}
    </motion.div>
  );
}
