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
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  MapPin,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLMSData } from "@/lib/data/use-lms-data";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import { Student, ExamAttempt, Exam } from "@/types";
import { getEffectiveExamStatus } from "@/lib/services/exam-service";

export default function StudentEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id;
  const router = useRouter();

  const { students, attempts: allAttempts, exams: allExams, loading } = useLMSData();
  const { resolveInstitution } = useEntityResolution();

  // Find target student
  const student = useMemo(() => {
    return (students as Student[]).find((s) => s.id === studentId) || null;
  }, [students, studentId]);

  // Filter attempts for this student
  const attempts = useMemo(() => {
    if (!student) return [];
    const sId = (student.id || "").toLowerCase();
    const sUid = (((student as any).uid || "") as string).toLowerCase();
    const sEmail = (student.email || "").toLowerCase();

    return (allAttempts as ExamAttempt[]).filter((a) => {
      const aId = (a.studentId || "").toLowerCase();
      const aEmail = (((a as any).studentEmail || "") as string).toLowerCase();
      return (
        (sId && aId === sId) ||
        (sUid && aId === sUid) ||
        (sEmail && aId === sEmail) ||
        (sEmail && aEmail === sEmail)
      );
    });
  }, [allAttempts, student]);

  // Filter exams assigned to this student
  const exams = useMemo(() => {
    if (!student) return [];
    return (allExams as Exam[]).filter((e) => {
      if (e.deletedAt) return false;
      if (!e.targets) return false;
      return e.targets.some((t) => {
        if (t.type === "students") return t.ids.includes(student.id);
        if (t.type === "college") return t.ids.includes(student.collegeId);
        if (t.type === "batch") return t.ids.some((b) => (student.batchIds || []).includes(b));
        if (t.type === "composite") {
          return (
            t.collegeId === student.collegeId ||
            (t.batchId && (student.batchIds || []).includes(t.batchId))
          );
        }
        return false;
      });
    });
  }, [allExams, student]);

  // Metrics
  const { avgScore, totalAssigned, totalCompleted, pendingAssigned, passCount } = useMemo(() => {
    if (!attempts.length) {
      return {
        avgScore: 0,
        totalAssigned: exams.length,
        totalCompleted: 0,
        pendingAssigned: exams.length,
        passCount: 0,
      };
    }

    const totalPerc = attempts.reduce((acc, a) => acc + (a.percentage || 0), 0);
    const average = totalPerc / attempts.length;
    const pass = attempts.filter((a) => a.passed).length;

    const pending = exams.filter((e) => {
      const eff = getEffectiveExamStatus(e);
      const hasAttempt = attempts.some((a) => a.examId === e.id);
      return eff === "active" && !hasAttempt;
    });

    return {
      avgScore: Math.round(average),
      totalAssigned: exams.length,
      totalCompleted: attempts.length,
      pendingAssigned: pending.length,
      passCount: pass,
    };
  }, [attempts, exams]);

  if (loading) {
    return (
      <div className="w-full h-[80vh] flex flex-col items-center justify-center text-muted-foreground space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-sm font-medium">Loading evaluation report...</p>
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
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No evaluation attempts recorded for this student yet.
                    </td>
                  </tr>
                ) : (
                  attempts.map((att) => (
                    <tr key={att.id} className="hover:bg-accent/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground">{att.examTitle}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {(att as any).completedAt || att.submittedAt ? new Date((att as any).completedAt || att.submittedAt).toLocaleDateString() : "N/A"}
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
                        {Math.floor(((att as any).timeSpent || (att as any).timeSpentSeconds || 0) / 60)}m {((att as any).timeSpent || (att as any).timeSpentSeconds || 0) % 60}s
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
