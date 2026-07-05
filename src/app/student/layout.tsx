"use client";

import { usePathname } from "next/navigation";
import DashboardLayout from "@/app/(dashboard)/layout";

export default function StudentRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isExamTakeRoute =
    pathname !== null && /^\/student\/exams\/[^/]+\/(take|review)(\/|$)/.test(pathname);

  if (isExamTakeRoute) {
    return <>{children}</>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
