"use client";
import TakeExamPage from "@/app/exams/[id]/take/page";

export default function AdminTakeExamPage({ params }: { params: Promise<{ id: string }> }) {
  return <TakeExamPage params={params} />;
}
