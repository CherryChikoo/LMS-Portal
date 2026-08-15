import type { Metadata } from "next";
import Script from "next/script";

import { AppProviders } from "@/providers/app-providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Masters Academy",
    default: "Masters Academy",
  },
  icons: {
    icon: "/api/branding/favicon",
    shortcut: "/api/branding/favicon",
    apple: "/api/branding/favicon",
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
      className="dark font-sans h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script
          id="theme-initializer"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"){document.documentElement.classList.remove("dark");}else{document.documentElement.classList.add("dark");}}catch(e){document.documentElement.classList.add("dark");}})()`,
          }}
        />
        <script
          id="branding-initializer"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var bStr=localStorage.getItem("lms_branding");var title="Masters Academy";if(bStr){var b=JSON.parse(bStr);if(b&&b.companyName)title=b.companyName;if(b&&b.logoBase64){var l=document.querySelectorAll("link[rel*='icon']");l.forEach(function(el){el.href=b.logoBase64;});}}document.title=title;}catch(e){document.title="Masters Academy";}})()`,
          }}
        />
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
