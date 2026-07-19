"use client";

import { motion } from "motion/react";
import { FileQuestion, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";

export default function QuestionBankPage() {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
      <PageHeader
        title="Question Bank"
        description="Build a reusable repository of exam questions organized by subject and topic."
        actions={
          <Button className="bg-brand hover:bg-brand/90 text-brand-foreground">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Question
          </Button>
        }
      />
      <EmptyState
        icon={FileQuestion}
        title="No questions yet"
        description="Create and organize questions by subject, topic, difficulty, and tags. Questions can be reused across multiple exams."
        actionLabel="Add Your First Question"
        onAction={() => {}}
      />
    </motion.div>
  );
}
