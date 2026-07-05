"use client";
import BatchDetailPage from "@/app/(dashboard)/batches/[id]/page";

export default function AdminBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <BatchDetailPage params={params} />;
}
