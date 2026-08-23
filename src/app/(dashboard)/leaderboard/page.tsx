"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Trophy, Medal, Award, Search, GraduationCap, Building2, Filter, ArrowLeft, ArrowRight } from "lucide-react";
import { useSessionStorage } from "@/hooks/use-session-storage";
import { GlassCard } from "@/components/shared/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { useLMSData } from "@/lib/data/use-lms-data";
import { getLeaderboardDataAction, getLeaderboardDataOptimizedAction, type LeaderboardEntry } from "@/lib/actions/leaderboard-actions";

export default function LeaderboardPage() {
  const { filteredColleges: colleges } = useLMSData();
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userCollegeId, setUserCollegeId] = useState<string | null>(null);
  const [userCollegeName, setUserCollegeName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Filters
  const [search, setSearch] = useSessionStorage("leaderboard_page_search", "");
  const [filterCollege, setFilterCollege] = useSessionStorage("leaderboard_page_filterCollege", "all");
  const [currentPage, setCurrentPage] = useSessionStorage("leaderboard_page_currentPage", 1);

  useEffect(() => {
    setMounted(true);
    try {
      const role = localStorage.getItem("lms_role") || "";
      const user = JSON.parse(localStorage.getItem("lms_user") || localStorage.getItem("user") || "{}");
      setUserRole(user.role || role);
      setCurrentUserId(user?.id || user?.uid || null);
      setUserCollegeId(user?.collegeId || null);
      setUserCollegeName(user?.collegeName || null);
    } catch {}
  }, []);

  const normalizedRole = (userRole || "").toLowerCase().trim();
  const isCollegeAdminOrStudent = normalizedRole === "student" || normalizedRole === "college_admin" || normalizedRole === "college";
  const isMainAdmin = !isCollegeAdminOrStudent;
  const isCollegeScoped = !isMainAdmin;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterCollege, setCurrentPage]);

  // Fetch leaderboard data
  useEffect(() => {
    if (!mounted) return;

    const fetchData = async () => {
      setLoading(true);
      
      console.log("[LEADERBOARD] Fetching data with filters:", {
        collegeId: filterCollege === "all" ? undefined : filterCollege,
        search: search.trim() || undefined,
        userRole: normalizedRole || undefined,
        userCollegeId: userCollegeId || undefined,
        page: currentPage,
        limit: 15,
      });
      
      const result = await getLeaderboardDataOptimizedAction({
        collegeId: filterCollege === "all" ? undefined : filterCollege,
        search: search.trim() || undefined,
        userRole: normalizedRole || undefined,
        userCollegeId: userCollegeId || undefined,
        page: currentPage,
        limit: 15,
      });

      console.log("[LEADERBOARD] Result:", result);

      if (result.success) {
        setLeaderboardData(result.data);
        setTotalCount(result.pagination.totalCount);
        setTotalPages(result.pagination.totalPages);
      } else {
        console.error("[LEADERBOARD] Error:", result.error);
      }
      setLoading(false);
    };

    fetchData();
  }, [mounted, filterCollege, search, currentPage, normalizedRole, userCollegeId]);

  const selectedColObj = !isCollegeAdminOrStudent && filterCollege !== "all" 
    ? colleges.find((c: any) => c.id === filterCollege) 
    : null;

  const displayCollegeTitle = isCollegeAdminOrStudent 
    ? (userCollegeName || "College")
    : (selectedColObj ? selectedColObj.name : "Global");

  if (!mounted || loading) {
    return <div className="p-12 text-center text-sm text-muted-foreground animate-pulse font-sans">Loading leaderboard rankings...</div>;
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-8 font-sans">
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight font-heading text-foreground capitalize">
            {displayCollegeTitle} Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCollegeScoped
              ? `Ranking students in ${displayCollegeTitle} by total evaluation scores.`
              : selectedColObj
                ? `Ranking students in ${selectedColObj.name} by total evaluation scores.`
                : "Ranking students across all partner colleges by evaluation performance."}
          </p>
        </div>
      </motion.div>

      {/* Filters Bar: College Filter is visible ONLY for Main Admin */}
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-card border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by student name, department, or roll number..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-border h-10"
          />
        </div>

        {isMainAdmin && (
          <div className="w-full sm:w-72 shrink-0">
            <Select value={filterCollege} onValueChange={(val) => setFilterCollege(val || "all")}>
              <SelectTrigger className="h-10 bg-background border-border flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="All Colleges (Global)">
                  {filterCollege === "all" ? "All Colleges (Global)" : (colleges.find((c: any) => c.id === filterCollege)?.name || "Unknown College")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colleges (Global)</SelectItem>
                {colleges.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || "Unnamed College"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </motion.div>

      {leaderboardData.length === 0 ? (
        <motion.div variants={staggerItem} className="p-12 text-center bg-card rounded-xl border border-border shadow-sm">
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground">No rankings available</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isCollegeAdminOrStudent 
              ? `No students found in ${displayCollegeTitle} or no assessments completed yet.`
              : "No students match the current filters."}
          </p>
        </motion.div>
      ) : (
        <motion.div variants={staggerItem} className="space-y-3 pt-2">
          <div className="space-y-2">
            {leaderboardData.map(entry => (
              <GlassCard 
                key={entry.studentId} 
                className={cn(
                  "p-4 flex items-center gap-4 transition-all hover:bg-accent/40 cursor-pointer",
                  entry.studentId === currentUserId ? "border-brand/50 bg-brand/5" : ""
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0",
                  entry.rank === 1 ? "bg-amber-500/20 text-amber-500" :
                  entry.rank === 2 ? "bg-slate-300/20 text-slate-300" :
                  entry.rank === 3 ? "bg-[#CD7F32]/20 text-[#CD7F32]" :
                  "bg-accent text-muted-foreground"
                )}>
                  #{entry.rank}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-foreground truncate flex items-center gap-2">
                    {entry.studentName}
                    {entry.rank === 1 && <Trophy className="w-4 h-4 text-amber-500" />}
                    {entry.rank === 2 && <Medal className="w-4 h-4 text-slate-400" />}
                    {entry.rank === 3 && <Award className="w-4 h-4 text-[#CD7F32]" />}
                    {entry.studentId === currentUserId && (
                      <Badge variant="outline" className="text-[9px] bg-brand/10 text-brand border-brand/20">YOU</Badge>
                    )}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {entry.collegeName || "No College"}</span>
                    <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {entry.department || "General"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 text-right">
                  <div className="hidden sm:block">
                    <div className="text-xs text-muted-foreground">Attempts</div>
                    <div className="font-semibold text-foreground">{entry.totalAttempts}</div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-xs text-muted-foreground">Average</div>
                    <div className="font-semibold text-foreground">{entry.averagePercentage}%</div>
                  </div>
                  <div className="bg-background rounded-lg px-3 py-1.5 border border-border">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Score</div>
                    <div className="font-black text-brand text-lg leading-none">{entry.totalScore}</div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/60 pt-6 mt-6">
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-bold text-foreground">{(currentPage - 1) * 30 + 1}</span> - <span className="font-bold text-foreground">{Math.min(currentPage * 30, totalCount)}</span> of <span className="font-bold text-foreground">{totalCount}</span> Students
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Prev
                </Button>
                
                <div className="text-sm font-medium text-foreground px-4">
                  Page {currentPage} of {totalPages}
                </div>
                
                <Button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-xl"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
