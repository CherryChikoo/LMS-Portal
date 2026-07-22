"use client";

import { usePathname } from "next/navigation";
import DashboardLayout from "@/app/(dashboard)/layout";

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage =
    pathname === "/login" || pathname?.startsWith("/login/");
  const isExamTakeRoute =
    pathname !== null && /^\/admin\/exams\/[^/]+\/take(\/|$)/.test(pathname);

  if (isLoginPage || isExamTakeRoute) {
    return <>{children}</>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
