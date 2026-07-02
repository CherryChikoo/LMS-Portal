"use client";

import { motion } from "motion/react";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { fadeInUp } from "@/lib/animations";

export default function ReportsPage() {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
      <PageHeader
        title="Reports"
        description="Generate and download performance reports for students and exams."
      />
      <EmptyState
        icon={FileText}
        title="No reports available"
        description="Reports will become available once students complete exams. You'll be able to generate performance reports, attendance summaries, and resource usage analytics."
      />
    </motion.div>
  );
}
