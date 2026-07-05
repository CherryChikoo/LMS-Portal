"use client";
import ReviewExamPage from "@/app/exams/[id]/review/page";

export default function AdminReviewExamPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReviewExamPage params={params} />;
}
