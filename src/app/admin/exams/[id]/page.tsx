"use client";
import ExamDetailsPage from "@/app/(dashboard)/exams/[id]/page";

export default function AdminExamDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  return <ExamDetailsPage params={params} />;
}
