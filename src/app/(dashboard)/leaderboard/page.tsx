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

interface StudentRank {
  student: Student;
  totalAttempts: number;
  totalScore: number;
  totalMaxMarks: number;
  averagePercentage: number;
  rank: number;
}

function LeaderboardContent() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCollege, setFilterCollege] = useState("all");

  useEffect(() => {
    try {
      const role = localStorage.getItem("lms_role");
      const user = JSON.parse(localStorage.getItem("lms_user") || "{}");
      setUserRole(role);
      setCurrentUserId(user?.id);
    } catch {}

    const loadData = async () => {
      try {
        const [studs, atts, cols] = await Promise.all([
          getAllStudents(),
          getStudentAttempts(),
          getAllColleges(),
        ]);
        setStudents(studs);
        setAttempts(atts);
        setColleges(cols);
      } catch (err) {
        console.error("Failed to load leaderboard data", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const rankedStudents = useMemo(() => {
    if (!students.length || !attempts.length) return [];

    const statsMap = new Map<string, { score: number; max: number; count: number }>();
    
    attempts.forEach(att => {
      const current = statsMap.get(att.studentId) || { score: 0, max: 0, count: 0 };
      statsMap.set(att.studentId, {
        score: current.score + (att.score || 0),
        max: current.max + (att.totalMarks || 0),
        count: current.count + 1
      });
    });

    let results: StudentRank[] = students
      .filter(s => statsMap.has(s.id))
      .map(student => {
        const stats = statsMap.get(student.id)!;
        const avg = stats.max > 0 ? (stats.score / stats.max) * 100 : 0;
        return {
          student,
          totalAttempts: stats.count,
          totalScore: stats.score,
          totalMaxMarks: stats.max,
          averagePercentage: Math.round(avg * 10) / 10,
          rank: 0,
        };
      });

    // Filter by college if admin selected one
    if (filterCollege !== "all") {
      results = results.filter(r => r.student.collegeId === filterCollege);
    }
    
    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(r => 
        r.student.name.toLowerCase().includes(q) || 
        r.student.department.toLowerCase().includes(q)
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
  }, [students, attempts, filterCollege, search]);

  if (loading) {
    return <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">Loading leaderboard rankings...</div>;
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-8 font-sans">
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading text-foreground">Global Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Ranking students across the platform by total evaluation scores.</p>
        </div>
      </motion.div>

      {/* Filters (Admin Only) */}
      {userRole !== "student" && (
        <motion.div variants={staggerItem} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-[#0A0A0A] border border-[#222222]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by student name or department..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-[#111111] border-[#222222] h-10" 
            />
          </div>
          <div className="w-full sm:w-64 shrink-0">
            <Select value={filterCollege} onValueChange={(val) => setFilterCollege(val || "all")}>
              <SelectTrigger className="h-10 bg-[#111111] border-[#222222]">
                <SelectValue placeholder="All Colleges" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colleges</SelectItem>
                {colleges.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      )}

      {rankedStudents.length === 0 ? (
        <motion.div variants={staggerItem} className="p-12 text-center bg-[#0A0A0A] rounded-xl border border-[#222222]">
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
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {r.student.collegeName}</span>
                    <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {r.student.department}</span>
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
                  <div className="bg-[#111111] rounded-lg px-3 py-1.5 border border-[#222222]">
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
  return (
    <Suspense fallback={<div className="p-12 text-center animate-pulse">Loading Leaderboard...</div>}>
      <LeaderboardContent />
    </Suspense>
  );
}
