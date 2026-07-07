"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "motion/react";
import { CalendarDays, ClipboardList, BookOpen, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { GlassCard } from "@/components/shared/glass-card";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { getAllExams, getAllResources, filterExamsForStudent, filterResourcesForStudent } from "@/lib/services";
import { toDate } from "@/lib/utils/date";
import type { Exam, Resource, Student } from "@/types";
import Link from "next/link";

export default function CalendarPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("admin");
  const [studentUser, setStudentUser] = useState<Student | null>({
    id: "",
    name: "",
    email: "",
    collegeId: "",
    department: "",
    semester: 1,
    section: "",
    rollNumber: "",
    batchIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Single centralized hierarchy hook powers the filter bar for non-student
  // users. Students remain filtered by their personal assignment via
  // filterExamsForStudent / filterResourcesForStudent (unchanged).
  const {
    filters,
    setFilters,
    institutionOptions,
    collegeOptions,
    departmentOptions,
    academicYearOptions,
    sectionOptions,
    batchOptions,
  } = useAcademicHierarchy({
    levels: ["institution", "department", "academicYear", "section", "batch"],
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const role = localStorage.getItem("lms_role") || "admin";
        setUserRole(role.toLowerCase());
        
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) {
          const parsed = JSON.parse(uStr) as Partial<Student>;
          setStudentUser((prev) => (prev ? { ...prev, ...parsed } : (parsed as Student)));
        }

        const [exData, resData] = await Promise.all([
          getAllExams(),
          getAllResources(),
        ]);
        setExams(exData);
        setResources(resData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const timelineEvents = useMemo(() => {
    let activeExams = exams;
    let activeResources = resources;

    if (userRole === "student" && studentUser) {
      activeExams = filterExamsForStudent(exams, studentUser);
      activeResources = filterResourcesForStudent(resources, studentUser);
    } else {
      // Non-student users (admin/trainer): narrow the timeline by the selected
      // hierarchy. Mirrors the logic in the Resources and Exams pages: match
      // against the first target's composite fields.
      activeExams = activeExams.filter((ex) => {
        const t = ex.targets?.[0];
        if (!t) return true;
        if (filters.collegeId && t.collegeId !== filters.collegeId) return false;
        if (filters.department && t.department !== filters.department) return false;
        if (filters.academicYear && t.academicYear !== filters.academicYear) return false;
        if (filters.section && t.section !== filters.section) return false;
        if (filters.batchId && t.batchId !== filters.batchId) return false;
        return true;
      });
      activeResources = activeResources.filter((res) => {
        const t = res.targets?.[0];
        if (!t) return true;
        if (filters.collegeId && t.collegeId !== filters.collegeId) return false;
        if (filters.department && t.department !== filters.department) return false;
        if (filters.academicYear && t.academicYear !== filters.academicYear) return false;
        if (filters.section && t.section !== filters.section) return false;
        if (filters.batchId && t.batchId !== filters.batchId) return false;
        return true;
      });
    }

    const events: { id: string; title: string; type: "exam" | "resource"; date: Date; extra: string }[] = [];

    activeExams.forEach(ex => {
      if (ex.startTime) {
        events.push({
          id: `ex-${ex.id}`,
          title: ex.title,
          type: "exam",
          date: toDate(ex.startTime) || new Date(),
          extra: `Scheduled for ${ex.duration} mins`,
        });
      } else {
        events.push({
          id: `ex-created-${ex.id}`,
          title: ex.title,
          type: "exam",
          date: toDate(ex.createdAt) || new Date(),
          extra: `Created Exam`,
        });
      }
    });

    activeResources.forEach(res => {
      events.push({
        id: `res-${res.id}`,
        title: res.title,
        type: "resource",
        date: toDate(res.createdAt) || new Date(),
        extra: `New Resource Added`,
      });
    });

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [
    exams,
    resources,
    userRole,
    studentUser,
    filters.collegeId,
    filters.department,
    filters.academicYear,
    filters.section,
    filters.batchId,
  ]);

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
      <PageHeader
        title="Academic Calendar & Events"
        description="View timeline of upcoming assessments and newly released study materials."
      />

      {userRole !== "student" && !loading && (
        <div className="bg-card/60 backdrop-blur-md p-4 rounded-2xl border border-border/80 shadow-sm">
          <AcademicHierarchyFilters
            showInstitution
            levels={["institution", "department", "academicYear", "section", "batch"]}
            filters={filters}
            onChange={setFilters}
            institutionOptions={institutionOptions}
            collegeOptions={collegeOptions}
            departmentOptions={departmentOptions}
            academicYearOptions={academicYearOptions}
            sectionOptions={sectionOptions}
            batchOptions={batchOptions}
            studentOptions={[]}
          />
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading timeline...</span>
        </div>
      ) : timelineEvents.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No events scheduled"
          description="Your timeline will show assessments and resources here."
        />
      ) : (
        <div className="max-w-3xl space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
          {timelineEvents.map((evt) => (
            <motion.div key={evt.id} variants={fadeInUp} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-card shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                {evt.type === "exam" ? <ClipboardList className="w-4 h-4 text-emerald-500" /> : <BookOpen className="w-4 h-4 text-brand" />}
              </div>
              <GlassCard className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 hover:border-brand/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary" className={evt.type === "exam" ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" : "bg-brand/10 text-brand hover:bg-brand/20"}>
                    {evt.type === "exam" ? "Assessment" : "Resource"}
                  </Badge>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {evt.date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                <h4 className="font-bold text-foreground text-sm mb-1">{evt.title}</h4>
                <p className="text-xs text-muted-foreground mb-3">{evt.extra}</p>
                <Link href={evt.type === "exam" ? "/exams" : "/resources"}>
                  <span className="text-xs font-semibold text-brand hover:underline">
                    View Details →
                  </span>
                </Link>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
