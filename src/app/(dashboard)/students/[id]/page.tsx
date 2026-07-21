"use client";

import { useEffect, useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { 
  ArrowLeft, GraduationCap, Mail, Building2, MapPin, Clock, 
  Target, TrendingUp, CheckCircle2, Loader2, Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  getStudentById, getAllExams, getStudentAttempts, getEffectiveExamStatus, filterExamsForStudent 
} from "@/lib/services";
import type { Student, Exam, ExamAttempt } from "@/types";
import { toDate } from "@/lib/utils/date";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StudentEvaluationPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const studentId = resolvedParams.id;
  const { resolveInstitution } = useEntityResolution();

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);

  useEffect(() => {
    if (!studentId) return;
    
    let isMounted = true;
    setLoading(true);

    async function loadData() {
      try {
        const studentData = await getStudentById(studentId);
        if (!studentData) {
          toast.error("Student not found.");
          router.push("/students");
          return;
        }

        const [allExams, studAttempts] = await Promise.all([
          getAllExams(),
          getStudentAttempts(studentId),
        ]);

        if (!isMounted) return;

        // Filter assignments for this specific student
        const assignedExams = filterExamsForStudent(allExams, studentData);

        setStudent(studentData);
        setExams(assignedExams);
        setAttempts(studAttempts);
      } catch (err) {
        console.error("Failed to load student report data:", err);
        toast.error("Failed to load report data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [studentId, router]);

  // Derived Statistics
  const {
    avgScore,
    totalAssigned,
    totalCompleted,
    pendingAssigned,
    passCount
  } = useMemo(() => {
    if (!student || attempts.length === 0) {
      return { 
        avgScore: 0, totalAssigned: exams.length, totalCompleted: 0, pendingAssigned: exams.length, passCount: 0
      };
    }

    const totalScore = attempts.reduce((acc, att) => acc + (att.percentage || 0), 0);
    const average = totalScore / attempts.length;
    
    let pass = 0;
    attempts.forEach(att => {
      if (att.passed) pass++;
    });

    const pending = exams.filter(e => {
      const eff = getEffectiveExamStatus(e);
      const hasAttempt = attempts.some(a => a.examId === e.id);
      return eff === "active" && !hasAttempt;
    });

    return {
      avgScore: Math.round(average),
      totalAssigned: exams.length,
      totalCompleted: attempts.length,
      pendingAssigned: pending.length,
      passCount: pass
    };
  }, [attempts, exams, student]);

  if (loading) {
    return (
      <div className="w-full h-[80vh] flex flex-col items-center justify-center text-muted-foreground space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-sm font-medium">Loading evaluation report...</p>
      </div>
    );
  }

  if (!student) return null;

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
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{student.name}</h2>
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
                      finalName = `${student.collegeName} (Deleted)`;
                    }
                    if (finalName.includes("(Deleted)")) {
                      return <span className="text-destructive font-bold">{finalName}</span>;
                    }
                    return finalName;
                  })()}
                </span>
              )}
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-muted-foreground/70" /> {student.department} • {student.section}</span>
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
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground font-medium">
                      No assessments completed by this student yet.
                    </td>
                  </tr>
                ) : (
                  attempts.map(att => {
                    const d = toDate(att.submittedAt);
                    return (
                      <tr key={att.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-5 font-semibold text-foreground">{att.examTitle || "Untitled Exam"}</td>
                        <td className="px-6 py-5 text-muted-foreground">
                          {d ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                        </td>
                        <td className="px-6 py-5 text-center font-extrabold text-foreground">
                          {att.score} / {att.totalMarks} <span className="text-muted-foreground text-xs font-medium ml-1">({att.percentage}%)</span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            att.passed ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500"
                          }`}>
                            {att.passed ? "Passed" : "Failed"}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right text-muted-foreground font-mono text-xs">
                          {att.timeTakenMinutes ? `${Math.round(att.timeTakenMinutes)}m` : "--"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
