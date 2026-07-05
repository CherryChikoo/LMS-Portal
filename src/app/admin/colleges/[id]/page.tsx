"use client";
import CollegeDetailPage from "@/app/(dashboard)/colleges/[id]/page";

export default function AdminCollegeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <CollegeDetailPage params={params} />;
}
