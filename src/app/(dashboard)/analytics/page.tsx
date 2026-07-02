"use client";

import { motion } from "motion/react";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { fadeInUp } from "@/lib/animations";

export default function AnalyticsPage() {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
      <PageHeader
        title="Analytics"
        description="Track student performance, exam statistics, and participation rates."
      />
      <EmptyState
        icon={BarChart3}
        title="No analytics data yet"
        description="Analytics dashboards will populate as students enroll and complete exams. You'll see performance trends, participation rates, and learning progress."
      />
    </motion.div>
  );
}
