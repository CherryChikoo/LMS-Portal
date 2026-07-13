import StudentsPage from "@/app/(dashboard)/students/page";
import CollegesPage from "@/app/(dashboard)/colleges/page";
import CollegeDetailPage from "@/app/(dashboard)/colleges/[id]/page";
import BatchesPage from "@/app/(dashboard)/batches/page";
import BatchDetailPage from "@/app/(dashboard)/batches/[id]/page";
import ExamsPage from "@/app/(dashboard)/exams/page";
import ResultsPage from "@/app/(dashboard)/results/page";
import ResourcesPage from "@/app/(dashboard)/resources/page";
import QuestionBankPage from "@/app/(dashboard)/question-bank/page";
import DoubtsPage from "@/app/(dashboard)/doubts/page";
import AnnouncementsPage from "@/app/(dashboard)/announcements/page";
import CalendarPage from "@/app/(dashboard)/calendar/page";
import ReportsPage from "@/app/(dashboard)/reports/page";
import AnalyticsPage from "@/app/(dashboard)/analytics/page";
import AuditPage from "@/app/(dashboard)/audit/page";
import SettingsPage from "@/app/(dashboard)/settings/page";
import DashboardHome from "@/app/(dashboard)/page";
import TakeExamPage from "@/app/exams/[id]/take/page";
import LeaderboardPage from "@/app/(dashboard)/leaderboard/page";

export default async function AdminCatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug || [];
  const primary = slug[0];
  const secondary = slug[1];
  const tertiary = slug[2];

  if (primary === "exams" && secondary && tertiary === "take") {
    return <TakeExamPage params={Promise.resolve({ id: secondary })} />;
  }

  let content = <DashboardHome />;

  switch (primary) {
    case "students":
      content = <StudentsPage />;
      break;
    case "colleges":
      if (secondary) {
        content = <CollegeDetailPage params={Promise.resolve({ id: secondary })} />;
      } else {
        content = <CollegesPage />;
      }
      break;
    case "batches":
      if (secondary) {
        content = <BatchDetailPage params={Promise.resolve({ id: secondary })} />;
      } else {
        content = <BatchesPage />;
      }
      break;
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
    case "reports":
      content = <ReportsPage />;
      break;
    case "analytics":
      content = <AnalyticsPage />;
      break;
    case "audit":
      content = <AuditPage />;
      break;
    case "settings":
      content = <SettingsPage />;
      break;
    case "leaderboard":
      content = <LeaderboardPage />;
      break;
    default:
      content = <DashboardHome />;
      break;
  }

  return content;
}
