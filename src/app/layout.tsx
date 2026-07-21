import type { Metadata } from "next";
import { AppProviders } from "@/providers/app-providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s",
    default: "Portal",
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet" />
      </head>
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
