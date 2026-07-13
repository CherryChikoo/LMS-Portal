import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  Users,
  Layers,
  FolderOpen,
  ClipboardList,
  Trophy,
  FileText,
  Megaphone,
  Settings,
  HelpCircle,
} from "lucide-react";
import type { NavSection } from "@/types";

export const APP_NAME = "LMS Portal";

export const NAVIGATION: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        title: "Colleges",
        href: "/colleges",
        icon: GraduationCap,
      },
      {
        title: "Students",
        href: "/students",
        icon: Users,
      },
      {
        title: "Custom Batches",
        href: "/batches",
        icon: Layers,
      },
      {
        title: "Audit Log",
        href: "/audit",
        icon: FileText,
      },
    ],
  },
  {
    title: "Content",
    items: [
      {
        title: "Resources",
        href: "/resources",
        icon: FolderOpen,
      },
    ],
  },
  {
    title: "Assessment",
    items: [
      {
        title: "Exams",
        href: "/exams",
        icon: ClipboardList,
      },
      {
        title: "Results",
        href: "/results",
        icon: Trophy,
      },
      {
        title: "Leaderboard",
        href: "/leaderboard",
        icon: Trophy,
      },
    ],
  },
];

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export const Z_INDEX = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  sidebar: 30,
  overlay: 40,
  modal: 50,
  toast: 60,
  tooltip: 70,
} as const;

export const SIDEBAR_WIDTH = {
  expanded: 260,
  collapsed: 72,
} as const;

export const ANIMATION_DURATION = {
  fast: 0.15,
  normal: 0.3,
  slow: 0.5,
  page: 0.6,
} as const;

export const PLACEHOLDER_AVATAR = "https://picsum.photos/seed/trainer-avatar/200/200";

export const DASHBOARD_STATS = {
  totalStudents: 1247,
  totalColleges: 8,
  upcomingExams: 5,
  totalResources: 342,
  activeStudents: 986,
  completedExams: 47,
};
