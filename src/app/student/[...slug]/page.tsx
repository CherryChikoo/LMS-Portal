"use client";

import { use } from "react";
import DashboardLayout from "@/app/(dashboard)/layout";
import ExamsPage from "@/app/(dashboard)/exams/page";
import ResultsPage from "@/app/(dashboard)/results/page";
import ResourcesPage from "@/app/(dashboard)/resources/page";
import QuestionBankPage from "@/app/(dashboard)/question-bank/page";
import DoubtsPage from "@/app/(dashboard)/doubts/page";
import AnnouncementsPage from "@/app/(dashboard)/announcements/page";
import CalendarPage from "@/app/(dashboard)/calendar/page";
import SettingsPage from "@/app/(dashboard)/settings/page";
import DashboardHome from "@/app/(dashboard)/page";

export default function StudentCatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug || [];
  const primary = slug[0];

  let content = <DashboardHome />;

  switch (primary) {
    case "exams":
      content = <ExamsPage />;
      break;
    case "results":
      content = <ResultsPage />;
      break;
    case "resources":
      content = <ResourcesPage />;
      break;
    case "question-bank":
      content = <QuestionBankPage />;
      break;
    case "doubts":
      content = <DoubtsPage />;
      break;
    case "announcements":
      content = <AnnouncementsPage />;
      break;
    case "calendar":
      content = <CalendarPage />;
      break;
    case "settings":
      content = <SettingsPage />;
      break;
    default:
      content = <DashboardHome />;
      break;
  }

  return <DashboardLayout>{content}</DashboardLayout>;
}
