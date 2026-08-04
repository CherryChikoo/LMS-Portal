"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Megaphone, Plus, Bell, Calendar, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllAnnouncements, getAnnouncementsForCurrentUser } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { toMillis } from "@/lib/utils/date";
import type { Announcement } from "@/types";

const priorityMeta: Record<
  string,
  { icon: React.ElementType; label: string; classes: string }
> = {
  urgent: { icon: AlertTriangle, label: "Urgent", classes: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  high: { icon: Bell, label: "High Priority", classes: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  medium: { icon: Info, label: "Medium Priority", classes: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  low: { icon: CheckCircle2, label: "Low Priority", classes: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

function formatAnnouncementDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  val: any
): string {
  if (!val) return "";
  try {
    let d: Date | null = null;
    if (typeof val === "number") d = new Date(val);
    else if (val?.seconds) d = new Date(val.seconds * 1000);
    else if (val?._seconds) d = new Date(val._seconds * 1000);
    else if (typeof val?.toDate === "function") d = val.toDate();
    else if (typeof val === "string") d = new Date(val);
    else if (val instanceof Date) d = val;
    if (!d || isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("admin");
  

  const isStudent = userRole === "student";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const role = (typeof window !== "undefined" && localStorage.getItem("lms_role")) || "admin";
        const normalizedRole = role.toLowerCase();
        setUserRole(normalizedRole);

        if (normalizedRole === "student") {
          const me = await getCurrentUser();
          if (me) {
            const result = await getAnnouncementsForCurrentUser(me.uid, me.email);
            setAnnouncements(result);
          } else {
            setAnnouncements([]);
          }
        } else {
          const result = await getAllAnnouncements();
          setAnnouncements(result.data);
        }
      } catch (err) {
        console.error("Failed to fetch announcements", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const pDiff = (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
      if (pDiff !== 0) return pDiff;
      const aTime = toMillis(a.createdAt) ?? 0;
      const bTime = toMillis(b.createdAt) ?? 0;
      return bTime - aTime;
    });
  }, [announcements]);

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Announcements"
        description={
          isStudent
            ? "Important notices, schedules, and reminders targeted for you."
            : "Publish announcements, reminders, and notifications for students."
        }
        actions={
          !isStudent ? (
            <Button className="bg-brand hover:bg-brand/90 text-brand-foreground">
              <Plus className="w-4 h-4 mr-1.5" />
              New Announcement
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading announcements...</span>
        </div>
      ) : sortedAnnouncements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={isStudent ? "No announcements for you" : "No announcements yet"}
          description={
            isStudent
              ? "When your trainer publishes an announcement targeting your batch or email, it will appear here."
              : "Create announcements to share important updates, exam schedules, or reminders with selected students or batches."
          }
          actionLabel={!isStudent ? "Create Your First Announcement" : undefined}
          onAction={!isStudent ? () => {} : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sortedAnnouncements.map((a) => {
            const meta = priorityMeta[a.priority] || priorityMeta.medium;
            const Icon = meta.icon;
            const dateStr = formatAnnouncementDate(a.createdAt || a.updatedAt);
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-5 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground leading-tight">{a.title}</h3>
                    {dateStr && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5 text-brand" />
                        {dateStr}
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-extrabold uppercase tracking-wider whitespace-nowrap ${meta.classes}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {meta.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {a.content}
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
