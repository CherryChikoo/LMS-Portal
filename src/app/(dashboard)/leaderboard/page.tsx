"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { motion } from "motion/react";
import { Trophy, Medal, Award, TrendingUp, Search, GraduationCap, Building2 } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAllStudents, getStudentAttempts, getAllColleges } from "@/lib/services";
import { Student, ExamAttempt, College } from "@/types";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { useLMSData } from "@/lib/data/use-lms-data";

import { useEntityResolution } from "@/lib/data/use-entity-resolution";

interface StudentRank {
  student: Student;
  totalAttempts: number;
  totalScore: number;
  totalMaxMarks: number;
  averagePercentage: number;
  rank: number;
}

function LeaderboardContent() {
  const { students, attempts, colleges, loading } = useLMSData();
  const { resolveInstitution } = useEntityResolution();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userCollegeId, setUserCollegeId] = useState<string | null>(null);
  const [userCollegeName, setUserCollegeName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCollege, setFilterCollege] = useState("all");

  useEffect(() => {
    setMounted(true);
    try {
      const role = localStorage.getItem("lms_role");
      const user = JSON.parse(localStorage.getItem("lms_user") || "{}");
      setUserRole(role);
      setCurrentUserId(user?.id || user?.uid);
      setUserCollegeId(user?.collegeId);
      setUserCollegeName(user?.collegeName);
    } catch {}
  }, []);

  const rankedStudents = useMemo(() => {
    interface StudentStats {
      student: Student;
      score: number;
      max: number;
      count: number;
    }

    const statsMap = new Map<string, StudentStats>();
    const studentStatsList: StudentStats[] = [];

    // 1. Seed all active students into stats list and map every identifier (id, uid, email) to the same reference
    (students as Student[]).forEach((s) => {
      if (!s || s.isDeleted) return;
      const sName = (s.name || "").toLowerCase();
      if (sName.includes("admin") || sName.includes("simulator") || sName.includes("trainer") || s.id === "admin-1") return;

      const statObj: StudentStats = { student: s, score: 0, max: 0, count: 0 };
      studentStatsList.push(statObj);

      if (s.id) statsMap.set(s.id.toLowerCase().trim(), statObj);
      if ((s as any).uid) statsMap.set(String((s as any).uid).toLowerCase().trim(), statObj);
      if (s.email) statsMap.set(s.email.toLowerCase().trim(), statObj);
    });

    // 2. Aggregate attempts onto matching student references
    (attempts as ExamAttempt[] || []).forEach((att: ExamAttempt) => {
      const name = (att.studentName || "").toLowerCase();
      if (
        name.includes("admin") ||
        name.includes("simulator") ||
        name.includes("ranti") ||
        name.includes("trainer") ||
        att.studentId === "admin-1"
      ) {
        return;
      }

      const attId = (att.studentId || "").toLowerCase().trim();
      const attEmail = (((att as any).studentEmail || "") as string).toLowerCase().trim();
      const attName = (att.studentName || "").toLowerCase().trim();

      let target = (attId ? statsMap.get(attId) : undefined) || (attEmail ? statsMap.get(attEmail) : undefined);

      if (!target && attName) {
        target = studentStatsList.find((item) => (item.student.name || "").toLowerCase().trim() === attName);
      }

      if (target) {
        target.score += (att.score || 0);
        target.max += (att.totalMarks || 0);
        target.count += 1;
      } else {
        const virtualStud: Student = {
          id: att.studentId || "unknown",
          name: att.studentName || (att as any).studentEmail || "Student",
          email: (att as any).studentEmail || "",
          department: "",
          collegeId: (att as any).collegeId || "",
          semester: 1,
          section: "A",
          rollNumber: "",
          batchIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const newStat: StudentStats = {
          student: virtualStud,
          score: att.score || 0,
          max: att.totalMarks || 0,
          count: 1,
        };
        studentStatsList.push(newStat);
        if (attId) statsMap.set(attId, newStat);
        if (attEmail) statsMap.set(attEmail, newStat);
      }
    });

    let results: StudentRank[] = studentStatsList
      .filter((item) => !item.student.isDeleted)
      .map((item) => {
        const avg = item.max > 0 ? (item.score / item.max) * 100 : 0;
        return {
          student: item.student,
          totalAttempts: item.count,
          totalScore: item.score,
          totalMaxMarks: item.max,
          averagePercentage: Math.round(avg * 10) / 10,
          rank: 0,
        };
      });

    // Filter by college if admin selected one
    // Scope for student role: students only see their own college peers
    if (userRole === "student" && userCollegeId && userCollegeId !== "col-unassigned" && userCollegeId !== "unassigned") {
      results = results.filter((r) => r.student.collegeId === userCollegeId);
    } else if (filterCollege !== "all") {
      results = results.filter((r) => r.student.collegeId === filterCollege);
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      results = results.filter(
        (r) =>
          (r.student.name || "").toLowerCase().includes(q) ||
          (r.student.department || "").toLowerCase().includes(q)
      );
    }

    // Sort by Total Score, then Average
    results.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.averagePercentage - a.averagePercentage;
    });

    // Assign ranks
    results.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    return results;
  }, [students, attempts, filterCollege, search, userRole, userCollegeId]);

  if (!mounted || loading) {
    return <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">Loading leaderboard rankings...</div>;
  }

  const isCollegeScoped = userRole === "student" && userCollegeId && userCollegeId !== "col-unassigned" && userCollegeId !== "unassigned";
  const displayCollegeName = userCollegeName || (colleges as College[]).find(c => c.id === userCollegeId)?.name || "College";

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-8 font-sans">
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading text-foreground">
            {isCollegeScoped ? `${displayCollegeName} Leaderboard` : "Global Leaderboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCollegeScoped
              ? `Ranking students in ${displayCollegeName} by total evaluation scores.`
              : "Ranking students across the platform by total evaluation scores."}
          </p>
        </div>
      </motion.div>

      {/* Filters (Admin Only) */}
      {userRole !== "student" && (
        <motion.div variants={staggerItem} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-card border border-border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by student name or department..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border h-10"
            />
          </div>
          <div className="w-full sm:w-64 shrink-0">
            <Select value={filterCollege} onValueChange={(val) => setFilterCollege(val || "all")}>
              <SelectTrigger className="h-10 bg-background border-border">
                <SelectValue placeholder="All Colleges">
                  {filterCollege === "all" ? "All Colleges" : ((colleges as College[]).find((c: College) => c.id === filterCollege)?.name || "Unknown College")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colleges</SelectItem>
                {(colleges as College[]).map((c: College) => (
                  <SelectItem key={c.id} value={c.id}>{c.name === c.id ? "Unknown" : c.name || "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      )}

      {rankedStudents.length === 0 ? (
        <motion.div variants={staggerItem} className="p-12 text-center bg-card rounded-xl border border-border shadow-sm">
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground">No rankings available yet</h3>
          <p className="text-sm text-muted-foreground">Students need to complete assessments to appear on the leaderboard.</p>
        </motion.div>
      ) : (
        <motion.div variants={staggerItem} className="space-y-3 pt-4">
          <div className="space-y-2">
            {rankedStudents.map(r => (
              <GlassCard 
                key={r.student.id} 
                className={cn(
                  "p-4 flex items-center gap-4 transition-all hover:bg-accent/40 cursor-pointer",
                  r.student.id === currentUserId ? "border-brand/50 bg-brand/5" : ""
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0",
                  r.rank === 1 ? "bg-amber-500/20 text-amber-500" :
                  r.rank === 2 ? "bg-slate-300/20 text-slate-300" :
                  r.rank === 3 ? "bg-[#CD7F32]/20 text-[#CD7F32]" :
                  "bg-accent text-muted-foreground"
                )}>
                  #{r.rank}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-foreground truncate flex items-center gap-2">
                    {r.student.name}
                    {r.rank === 1 && <Trophy className="w-4 h-4 text-amber-500" />}
                    {r.rank === 2 && <Medal className="w-4 h-4 text-slate-400" />}
                    {r.rank === 3 && <Award className="w-4 h-4 text-[#CD7F32]" />}
                    {r.student.id === currentUserId && (
                      <Badge variant="outline" className="text-[9px] bg-brand/10 text-brand border-brand/20">YOU</Badge>
                    )}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {resolveInstitution(r.student.collegeId)}</span>
                    <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {r.student.department || "No Department"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 text-right">
                  <div className="hidden sm:block">
                    <div className="text-xs text-muted-foreground">Attempts</div>
                    <div className="font-semibold text-foreground">{r.totalAttempts}</div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs text-muted-foreground">Average</div>
                    <div className="font-semibold text-foreground">{r.averagePercentage}%</div>
                  </div>
                  <div className="bg-background rounded-lg px-3 py-1.5 border border-border">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Score</div>
                    <div className="font-black text-brand text-lg leading-none">{r.totalScore}</div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function LeaderboardPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="p-12 text-center text-sm text-muted-foreground animate-pulse font-sans">Loading Leaderboard...</div>;
  }

  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-muted-foreground animate-pulse font-sans">Loading Leaderboard...</div>}>
      <LeaderboardContent />
    </Suspense>
  );
}
