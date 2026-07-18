import type { Metadata } from "next";
import { AppProviders } from "@/providers/app-providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LMS Portal",
    template: "%s - LMS Portal",
  },
  description:
    "A modern Learning Management System for trainers to manage colleges, students, learning resources, and online examinations.",
  keywords: ["LMS", "learning management", "education", "online exams", "training"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="font-sans h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AppProviders>
          <TooltipProvider delay={300}>
            {children}
          </TooltipProvider>
        </AppProviders>
        <div className="mesh-gradient" aria-hidden="true" />
      </body>
    </html>
  );
}
