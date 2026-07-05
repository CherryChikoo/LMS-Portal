"use client";

import AttemptAnswerSheetPage from "@/app/(dashboard)/results/[attemptId]/page";

export default function AdminAttemptAnswerSheetPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  return <AttemptAnswerSheetPage params={params} />;
}
