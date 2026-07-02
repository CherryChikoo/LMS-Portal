"use client";

import { motion } from "motion/react";
import { Megaphone, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";

export default function AnnouncementsPage() {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
      <PageHeader
        title="Announcements"
        description="Publish announcements, reminders, and notifications for students."
        actions={
          <Button className="bg-brand hover:bg-brand/90 text-white">
            <Plus className="w-4 h-4 mr-1.5" />
            New Announcement
          </Button>
        }
      />
      <EmptyState
        icon={Megaphone}
        title="No announcements yet"
        description="Create announcements to share important updates, exam schedules, or reminders with selected students or batches."
        actionLabel="Create Your First Announcement"
        onAction={() => {}}
      />
    </motion.div>
  );
}
