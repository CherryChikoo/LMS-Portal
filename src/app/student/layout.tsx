import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/nav/StudentSidebar";
import { StudentHeader } from "@/components/nav/StudentHeader";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { NavigationProgress } from "@/components/layout/navigation-progress";

export default async function StudentRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-Side Auth Guard: Catch unauthorized users before rendering HTML (Eliminates FOUC)
  const cookieStore = await cookies();
  const role = cookieStore.get("lms_role")?.value;

  // The fallback is purely to protect the layout. API routes handle actual token verification.
  if (!role || (role !== "student" && role !== "admin" && role !== "superadmin" && role !== "college_admin")) {
    redirect("/login?redirect=/student");
  }

  // Pure Server Component Layout Shell
  return (
    <div className="min-h-[100dvh] flex relative bg-transparent overflow-x-hidden">
      <NavigationProgress />
      
      {/* Targeted Client Leaf Components */}
      <StudentSidebar />
      <MobileSidebar />

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col min-h-[100dvh] relative z-10 min-w-0 w-full lg:ml-[260px] lg:peer-[.w-\[80px\]]:ml-[80px] transition-[margin-left] duration-300">
        <StudentHeader />
        <main className="flex-1 p-4 sm:p-7 lg:p-9 lg:pb-16 pb-20 max-w-[100vw] lg:max-w-[1600px] w-full mx-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
