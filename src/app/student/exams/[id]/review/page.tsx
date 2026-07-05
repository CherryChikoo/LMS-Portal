"use client";
import ReviewExamPage from "@/app/exams/[id]/review/page";

export default function StudentReviewExamPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReviewExamPage params={params} />;
}
