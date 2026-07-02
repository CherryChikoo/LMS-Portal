"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { useSidebar } from "@/hooks/use-sidebar";
import { useIsDesktop } from "@/hooks/use-media-query";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { width } = useSidebar();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const verifyAuth = () => {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (!uStr) {
        window.location.replace("/login");
      }
    };
    verifyAuth();
    window.addEventListener("pageshow", verifyAuth);

    // Live bidirectional synchronization with Firestore
    const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
    if (!uStr) return () => window.removeEventListener("pageshow", verifyAuth);

    let parsedUser: any = null;
    try {
      parsedUser = JSON.parse(uStr);
    } catch {
      return () => window.removeEventListener("pageshow", verifyAuth);
    }

    if (!parsedUser || !parsedUser.id) return () => window.removeEventListener("pageshow", verifyAuth);

    const unsubs: (() => void)[] = [];

    if (parsedUser.role === "student") {
      import("firebase/firestore").then(({ doc, onSnapshot }) => {
        import("@/lib/firebase/config").then(({ db }) => {
          const unsubId = onSnapshot(doc(db, "students", parsedUser.id), (docSnap) => {
            if (docSnap.exists()) {
              const s = docSnap.data();
              const updated = {
                ...parsedUser,
                name: s.name || parsedUser.name,
                email: s.email || parsedUser.email,
                department: s.department || parsedUser.department,
                collegeId: s.collegeId || parsedUser.collegeId,
                collegeName: s.collegeName || parsedUser.collegeName,
                academicYear: s.academicYear || parsedUser.academicYear,
                section: s.section || parsedUser.section,
                batchIds: s.batchIds || parsedUser.batchIds,
              };
              localStorage.setItem("lms_user", JSON.stringify(updated));
              localStorage.setItem("user", JSON.stringify(updated));
              window.dispatchEvent(new Event("storage"));
            }
          });
          unsubs.push(unsubId);
        });
      });
    } else {
      import("firebase/firestore").then(({ doc, onSnapshot }) => {
        import("@/lib/firebase/config").then(({ db }) => {
          const unsubUser = onSnapshot(doc(db, "users", parsedUser.id), (docSnap) => {
            if (docSnap.exists()) {
              const u = docSnap.data();
              const updated = {
                ...parsedUser,
                name: u.displayName || parsedUser.name,
                email: u.email || parsedUser.email,
              };
              localStorage.setItem("lms_user", JSON.stringify(updated));
              localStorage.setItem("user", JSON.stringify(updated));
              window.dispatchEvent(new Event("storage"));
            }
          });
          unsubs.push(unsubUser);
        });
      });
    }

    return () => {
      window.removeEventListener("pageshow", verifyAuth);
      unsubs.forEach((u) => u());
    };
  }, []);

  return (
    <div className="min-h-[100dvh] flex relative bg-transparent overflow-x-hidden">
      {/* Background fluid marble glassmorphism mesh */}
      <div className="mesh-gradient" />

      {/* Sidebar - desktop */}
      <Sidebar />

      {/* Mobile sidebar */}
      <MobileSidebar />

      {/* Main content area */}
      <motion.div
        className="flex-1 flex flex-col min-h-[100dvh] relative z-10"
        animate={{
          marginLeft: isDesktop ? width : 0,
        }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <Topbar />
        <main className="flex-1 p-5 sm:p-7 lg:p-9 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </motion.div>
    </div>
  );
}
