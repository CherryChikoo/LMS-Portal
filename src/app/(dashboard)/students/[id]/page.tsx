"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeft,
  GraduationCap,
  Building2,
  Mail,
  CheckCircle2,
  Clock,
  TrendingUp,
  Target,
  AlertCircle,
  Loader2,
  MapPin,
  Calendar,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLMSData } from "@/lib/data/use-lms-data";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import { Student, ExamAttempt, Exam } from "@/types";
import { getEffectiveExamStatus, filterExamsForStudent } from "@/lib/services/exam-service";
import { LoadingState } from "@/components/shared/loading-state";
import { getStudentById } from "@/lib/services";
import { toDate, toMillis } from "@/lib/utils/date";

export default function StudentEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id;
  const router = useRouter();

  const { students, attempts: allAttempts, exams: allExams, rawBatches, batches, loading } = useLMSData();
  const { resolveInstitution, resolveBatch } = useEntityResolution();

  const [fetchedStudent, setFetchedStudent] = useState<Student | null>(null);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [directAttempts, setDirectAttempts] = useState<ExamAttempt[]>([]);
  const [isFetchingAttempts, setIsFetchingAttempts] = useState(false);
  const [directBatches, setDirectBatches] = useState<any[]>([]);

  // Check access control
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const userStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        const role = localStorage.getItem("lms_role");
        
        if (userStr) {
          const user = JSON.parse(userStr);
          setCurrentUser(user);
          
          // Students can only view their own profile
          const userRole = (user.role || role || "").toLowerCase();
          if (userRole === "student") {
            const userId = user.id || user.uid;
            if (userId !== studentId) {
              console.warn("[STUDENT_DETAIL] Access denied - student trying to view another student's profile");
              setAccessDenied(true);
            }
          }
        }
      } catch (err) {
        console.error("[STUDENT_DETAIL] Error checking access:", err);
      }
    }
  }, [studentId]);

  // Find target student from cache OR fallback fetch
  const student = useMemo(() => {
    return (students as Student[]).find((s) => s.id === studentId) || fetchedStudent;
  }, [students, studentId, fetchedStudent]);

  // Fallback fetch if not in top 100 cache
  useEffect(() => {
    if (!loading && !student && !isFetchingProfile && !fetchedStudent) {
      setIsFetchingProfile(true);
      getStudentById(studentId)
        .then((data) => {
          if (data) {
            setFetchedStudent(data);
            // Extract batches from student_batches relation
            const studentBatches = (data as any).student_batches || [];
            if (studentBatches.length > 0) {
              const extractedBatches = studentBatches
                .map((sb: any) => sb.batches || sb.batch)
                .filter(Boolean);
              console.log("[STUDENT_DETAIL] Extracted batches from fetched student:", extractedBatches);
              setDirectBatches(extractedBatches);
            }
          }
        })
        .catch(console.error)
        .finally(() => setIsFetchingProfile(false));
    }
  }, [loading, student, studentId, isFetchingProfile, fetchedStudent]);

  // Fetch attempts directly from server if cache is empty or doesn't have this student's attempts
  useEffect(() => {
    const fetchAttempts = async () => {
      if (!student || isFetchingAttempts || loading) return;
      
      // Check if cache has any attempts at all
      const cacheHasAttempts = allAttempts && allAttempts.length > 0;
      console.log("[STUDENT_DETAIL] Cache has attempts:", cacheHasAttempts, "Count:", allAttempts?.length || 0);
      
      // If cache is empty or has very few attempts, fetch directly from server
      if (!cacheHasAttempts || (allAttempts && allAttempts.length < 10)) {
        console.log("[STUDENT_DETAIL] Fetching attempts directly from server for student:", studentId);
        setIsFetchingAttempts(true);
        
        try {
          // Dynamic import to avoid circular dependencies
          const { getResultsByStudentAction } = await import("@/lib/actions/exam-actions");
          const results = await getResultsByStudentAction(studentId);
          console.log("[STUDENT_DETAIL] Fetched attempts from server:", results?.length || 0);
          
          if (results && results.length > 0) {
            setDirectAttempts(results as ExamAttempt[]);
          }
        } catch (err) {
          console.error("[STUDENT_DETAIL] Error fetching attempts:", err);
        } finally {
          setIsFetchingAttempts(false);
        }
      }
    };
    
    fetchAttempts();
  }, [student, studentId, loading, allAttempts, isFetchingAttempts]);

  // Resolve assigned batches list - Get from student_batches table
  const assignedBatches = useMemo(() => {
    if (!student) return [];
    
    console.log("[STUDENT_BATCHES] Calculating assigned batches for student:", student.id);
    console.log("  - student.batches:", student.batches);
    console.log("  - student.batchIds:", student.batchIds);
    console.log("  - student.student_batches:", (student as any).student_batches);
    console.log("  - student.batchNames:", student.batchNames);
    console.log("  - directBatches:", directBatches);
    
    // Use directly fetched batches if available
    if (directBatches.length > 0) {
      console.log("  - Using directBatches:", directBatches.length);
      return directBatches.map((b: any) => ({
        id: b.id,
        name: b.name,
        section: b.section || student.section,
      }));
    }
    
    // First, check if student has pre-populated batches with valid names from student_batches join
    const preBatches = (student.batches || []).filter((b: any) => b && b.name && b.name !== "Unknown Batch");
    if (preBatches.length > 0) {
      console.log("  - Found pre-populated batches:", preBatches.length);
      return preBatches;
    }

    // Try to get from student_batches relation
    const studentBatchesRelation = (student as any).student_batches || [];
    if (studentBatchesRelation.length > 0) {
      console.log("  - Found student_batches relation with", studentBatchesRelation.length, "items");
      const batchesFromRelation = studentBatchesRelation
        .map((sb: any) => {
          console.log("    - Processing student_batch:", sb);
          // Get batch details from the relation
          const batchData = sb.batches || sb.batch;
          if (batchData && batchData.id) {
            console.log("      - Found batch data:", batchData);
            return {
              id: batchData.id,
              name: batchData.name || resolveBatch(batchData.id),
              section: batchData.section || student.section,
            };
          }
          // If we only have batchId, try to resolve it
          if (sb.batchId) {
            console.log("      - Only have batchId:", sb.batchId);
            const allBatchesSource = (rawBatches?.length ? rawBatches : batches) || [];
            const matchedBatch = (allBatchesSource as any[]).find((rb: any) => rb.id === sb.batchId);
            if (matchedBatch) {
              console.log("      - Matched batch from cache:", matchedBatch);
            }
            return {
              id: sb.batchId,
              name: matchedBatch?.name || resolveBatch(sb.batchId),
              section: matchedBatch?.section || student.section,
            };
          }
          return null;
        })
        .filter(Boolean);
      
      if (batchesFromRelation.length > 0) {
        console.log("  - Found batches from student_batches relation:", batchesFromRelation.length);
        return batchesFromRelation;
      }
    }

    // Collect batch IDs from batchIds
    const allBatchesSource = (rawBatches?.length ? rawBatches : batches) || [];
    const rawIds = [
      ...(student.batchIds || []),
    ].filter(Boolean);

    const uniqueIds = Array.from(new Set(rawIds));
    console.log("  - Unique batch IDs from batchIds:", uniqueIds);
    
    if (uniqueIds.length === 0 && (student.batchNames?.length || (student as any).batchesList?.length)) {
      const fallbackList = (student as any).batchesList || (student.batchNames || []).map((n: string) => ({ id: n, name: n, section: student.section }));
      console.log("  - Using fallback batch list from batchNames:", fallbackList.length);
      return fallbackList;
    }

    const result = uniqueIds.map((bId) => {
      const matchedBatch = (allBatchesSource as any[]).find((rb: any) => rb.id === bId || rb.name === bId);
      let name = matchedBatch?.name || resolveBatch(bId);
      if (name === "Unknown Batch" || !name) {
        name = student.batchNames?.[0] || bId;
      }
      return {
        id: bId,
        name,
        section: matchedBatch?.section || student.section,
      };
    });
    
    console.log("  - Final assigned batches:", result.length, result);
    return result;
  }, [student, resolveBatch, rawBatches, batches, directBatches]);

  // Filter attempts for this student - use direct fetch if available, otherwise use cache
  const attempts = useMemo(() => {
    if (!student) return [] as ExamAttempt[];
    
    // Prefer directly fetched attempts over cache
    const sourceAttempts = directAttempts.length > 0 ? directAttempts : (allAttempts || []);
    
    const sId = (student.id || "").toLowerCase();
    const sUid = (((student as any).uid || "") as string).toLowerCase();
    const sEmail = (student.email || "").toLowerCase();

    console.log("[STUDENT_DETAIL] Filtering attempts for student:");
    console.log("  - Student ID:", sId);
    console.log("  - Student UID:", sUid);
    console.log("  - Student Email:", sEmail);
    console.log("  - Source: ", directAttempts.length > 0 ? "Direct fetch" : "Cache");
    console.log("  - Total attempts available:", sourceAttempts.length);

    if (sourceAttempts.length > 0) {
      console.log("  - Sample attempt:", {
        id: sourceAttempts[0].id,
        studentId: sourceAttempts[0].studentId,
        studentName: (sourceAttempts[0] as any).studentName,
        examTitle: sourceAttempts[0].examTitle,
        score: sourceAttempts[0].score
      });
    }

    const filtered = (sourceAttempts as ExamAttempt[]).filter((a) => {
      const aId = (a.studentId || "").toLowerCase();
      const aEmail = ((a as any).studentEmail || "").toLowerCase();
      
      const idMatch = (sId && aId === sId) || (sUid && aId === sUid);
      const emailMatch = sEmail && aEmail && aEmail === sEmail;
      
      return idMatch || emailMatch;
    });

    console.log("[STUDENT_DETAIL] Filtered attempts for student:", filtered.length);
    if (filtered.length > 0) {
      console.log("[STUDENT_DETAIL] Sample filtered attempt:", {
        examTitle: filtered[0].examTitle,
        score: filtered[0].score,
        studentId: filtered[0].studentId
      });
    } else if (sourceAttempts.length > 0) {
      // Debug: why didn't we match?
      console.log("[STUDENT_DETAIL] No matches. First attempt details:");
      console.log("  - Attempt studentId:", sourceAttempts[0].studentId);
      console.log("  - Looking for ID:", sId);
      console.log("  - ID match?", sourceAttempts[0].studentId?.toLowerCase() === sId);
    }

    return filtered.sort((a, b) => {
      const msA = toMillis((a as any).completedAt || a.submittedAt || a.createdAt) ?? 0;
      const msB = toMillis((b as any).completedAt || b.submittedAt || b.createdAt) ?? 0;
      return msB - msA;
    });
  }, [allAttempts, directAttempts, student]);

  // Filter exams assigned to this student (excluding past exams created before student enrollment)
  const exams = useMemo(() => {
    if (!student) return [];
    return filterExamsForStudent(allExams as Exam[], student).filter(e => !e.deletedAt);
  }, [allExams, student]);

  // Metrics
  const { avgScore, totalAssigned, totalCompleted, pendingAssigned, passCount } = useMemo(() => {
    console.log("[STUDENT_DETAIL_METRICS] Calculating metrics:");
    console.log("  - Attempts count:", attempts.length);
    console.log("  - Exams count:", exams.length);
    console.log("  - Assigned batches:", assignedBatches.length);
    
    // Count exams assigned to student's CURRENT batches only
    const batchIds = assignedBatches.map((b: any) => b.id);
    const assignedExams = exams.filter((e) => {
      // Check if exam is assigned to any of the student's batches
      const examBatches = e.targets?.batches || [];
      const isAssignedToBatch = examBatches.some(eb => batchIds.includes(eb));
      
      // Also check if assigned to all students or specific student
      const assignedToAll = e.targets?.allStudents || false;
      const assignedToSpecificStudent = e.targets?.specificStudents?.includes(student.id) || false;
      
      return isAssignedToBatch || assignedToAll || assignedToSpecificStudent;
    });
    
    console.log("  - Exams assigned to current batches:", assignedExams.length);
    
    if (!attempts.length) {
      return {
        avgScore: 0,
        totalAssigned: assignedExams.length,
        totalCompleted: 0,
        pendingAssigned: assignedExams.length,
        passCount: 0,
      };
    }

    const totalPerc = attempts.reduce((acc, a) => acc + (a.percentage || 0), 0);
    const average = totalPerc / attempts.length;
    const pass = attempts.filter((a) => a.passed).length;

    const pending = assignedExams.filter((e) => {
      const eff = getEffectiveExamStatus(e);
      const hasAttempt = attempts.some((a) => a.examId === e.id);
      return eff === "active" && !hasAttempt;
    });

    console.log("  - Total completed:", attempts.length);
    console.log("  - Pending:", pending.length);
    console.log("  - Pass count:", pass);

    return {
      avgScore: Math.round(average),
      totalAssigned: assignedExams.length,
      totalCompleted: attempts.length,
      pendingAssigned: pending.length,
      passCount: pass,
    };
  }, [attempts, exams, assignedBatches, student]);

  if (loading || isFetchingProfile) {
    return (
      <div className="w-full py-6">
        <LoadingState variant="page" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center text-muted-foreground space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500/60" />
        <h3 className="text-lg font-bold text-foreground">Access Denied</h3>
        <p className="text-sm text-muted-foreground">You can only view your own profile.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center text-muted-foreground space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500/60" />
        <h3 className="text-lg font-bold text-foreground">Student Profile Not Found</h3>
        <Button variant="outline" onClick={() => router.back()}>
          Back to Students
        </Button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 w-full pb-12">
      {/* Back Button & Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground pl-0 gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Button>
      </div>

      {/* Student Profile Card */}
      <div className="bg-card border border-border rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-2xl bg-brand/10 text-brand flex items-center justify-center font-bold text-4xl shrink-0">
            {((student.name || student.email || "ST").charAt(0)).toUpperCase()}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{student.name || student.email || "Student"}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                student.status === "restricted" 
                  ? "bg-rose-500/15 text-rose-500 border border-rose-500/30" 
                  : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
              }`}>
                {student.status === "restricted" ? "Restricted" : "Active"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-muted-foreground/70" /> {student.email}</span>
              <span className="flex items-center gap-1.5"><GraduationCap className="w-4 h-4 text-muted-foreground/70" /> {student.rollNumber || "N/A"}</span>
              {student.collegeId && (
                <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-muted-foreground/70" /> 
                  {(() => {
                    const resolvedName = resolveInstitution(student.collegeId);
                    let finalName = resolvedName;
                    if (resolvedName === "Unknown Institution" && student.collegeName) {
                      finalName = student.collegeName;
                    }
                    
                    if (finalName.includes("(Deleted)")) {
                      return <span className="text-destructive font-bold">{finalName}</span>;
                    }
                    return finalName;
                  })()}
                </span>
              )}
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-muted-foreground/70" /> {student.department || "General"} • Sec {student.section || "A"}</span>
              <span className="flex items-center gap-1.5 font-semibold text-brand">
                <Layers className="w-4 h-4 text-brand" /> {assignedBatches.length} {assignedBatches.length === 1 ? "Batch" : "Batches"}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/40 text-xs mt-2">
              <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand" /> Assigned Batches:
              </span>
              {assignedBatches.length > 0 ? (
                assignedBatches.map((b: any) => (
                  <span
                    key={b.id || b.name}
                    className="px-2.5 py-1 rounded-lg bg-brand/10 border border-brand/20 text-brand font-semibold text-xs flex items-center gap-1.5"
                  >
                    <span>{b.name}</span>
                    {b.section && <span className="text-[10px] opacity-75">({b.section})</span>}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground italic text-xs">No batches assigned</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-2 shadow-sm hover:border-indigo-500/50 transition-colors">
          <span className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-500" /> Overall Average
          </span>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-4xl font-extrabold text-foreground tracking-tight">{avgScore}%</span>
          </div>
        </div>

        <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-2 shadow-sm hover:border-blue-500/50 transition-colors">
          <span className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Target className="w-4 h-4 text-blue-500" /> Assessments
          </span>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-4xl font-extrabold text-foreground tracking-tight">{totalCompleted}</span>
            <span className="text-sm font-medium text-muted-foreground mb-1">/ {totalAssigned}</span>
          </div>
        </div>

        <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-2 shadow-sm hover:border-emerald-500/50 transition-colors">
          <span className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Pass Rate
          </span>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-4xl font-extrabold text-foreground tracking-tight">
              {totalCompleted > 0 ? Math.round((passCount / totalCompleted) * 100) : 0}%
            </span>
          </div>
        </div>

        <div className="bg-card border border-border p-5 rounded-2xl flex flex-col gap-2 shadow-sm hover:border-amber-500/50 transition-colors">
          <span className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-500" /> Pending Action
          </span>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-4xl font-extrabold text-foreground tracking-tight">{pendingAssigned}</span>
            <span className="text-sm font-medium text-muted-foreground mb-1">exams</span>
          </div>
        </div>
      </div>

      {/* ASSESSMENTS TABLE */}
      <div className="space-y-4 pt-4">
        <h3 className="text-lg font-bold text-foreground">Assessment History</h3>
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-[11px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Assessment Name</th>
                  <th className="px-6 py-4">Submitted</th>
                  <th className="px-6 py-4 text-center">Score</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Time Taken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attempts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No evaluation attempts recorded for this student yet.
                    </td>
                  </tr>
                ) : (
                  attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-accent/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground">{att.examTitle}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {(() => {
                          const dateObj = toDate((att as any).completedAt || att.submittedAt || att.createdAt);
                          return dateObj ? dateObj.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Date Unavailable";
                        })()}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-foreground">
                        {att.score} / {att.totalMarks} ({att.percentage}%)
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge
                          variant="outline"
                          className={
                            att.passed
                              ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-600 border-rose-500/30"
                          }
                        >
                          {att.passed ? "Passed" : "Review"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-muted-foreground font-mono">
                        {(() => {
                          const mins = (att as any).timeTakenMinutes ?? ((att as any).timeSpentSeconds ? Math.ceil((att as any).timeSpentSeconds / 60) : ((att as any).timeSpent ? Math.ceil((att as any).timeSpent / 60) : 0));
                          return `${mins || 0}m 0s`;
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
