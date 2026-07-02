"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "motion/react";
import { CalendarDays, ClipboardList, BookOpen, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { GlassCard } from "@/components/shared/glass-card";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, staggerContainer, staggerItem } from "@/lib/animations";
import { getAllExams, getAllResources, filterExamsForStudent, filterResourcesForStudent } from "@/lib/services";
import type { Exam, Resource } from "@/types";
import Link from "next/link";

export default function CalendarPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("admin");
  const [studentUser, setStudentUser] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const role = localStorage.getItem("lms_role") || "admin";
        setUserRole(role.toLowerCase());
        
        const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
        if (uStr) setStudentUser(JSON.parse(uStr));
        else setStudentUser({ id: "guest", name: "Student Candidate", email: "student@lms.dev", department: "Computer Science & Engineering", college: "St. Xavier's College of Engineering", batchIds: [] });

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
    }

    const events: { id: string; title: string; type: "exam" | "resource"; date: Date; extra: string }[] = [];

    activeExams.forEach(ex => {
      if (ex.startTime) {
        events.push({
          id: `ex-${ex.id}`,
          title: ex.title,
          type: "exam",
          date: new Date(ex.startTime),
          extra: `Scheduled for ${ex.duration} mins`,
        });
      } else {
        events.push({
          id: `ex-created-${ex.id}`,
          title: ex.title,
          type: "exam",
          date: ex.createdAt instanceof Date ? ex.createdAt : new Date(ex.createdAt || Date.now()),
          extra: `Created Exam`,
        });
      }
    });

    activeResources.forEach(res => {
      events.push({
        id: `res-${res.id}`,
        title: res.title,
        type: "resource",
        date: res.createdAt instanceof Date ? res.createdAt : new Date(res.createdAt || Date.now()),
        extra: `New Resource Added`,
      });
    });

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [exams, resources, userRole, studentUser]);

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
      <PageHeader
        title="Academic Calendar & Events"
        description="View timeline of upcoming assessments and newly released study materials."
      />
      
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
          {timelineEvents.map((evt, idx) => (
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
