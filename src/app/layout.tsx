import type { Metadata } from "next";

import { AppProviders } from "@/providers/app-providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

import { getCompanyBrandingLightAction } from "@/lib/actions/branding-actions";

export async function generateMetadata(): Promise<Metadata> {
  let title = "Masters Academy";
  try {
    const branding = await getCompanyBrandingLightAction();
    if (branding?.companyName) {
      title = branding.companyName;
    }
  } catch (err) {}

  return {
    title: title,
    icons: {
      icon: "/api/branding/favicon",
      shortcut: "/api/branding/favicon",
      apple: "/api/branding/favicon",
    },
    description:
      "A modern Learning Management System for trainers to manage colleges, students, learning resources, and online examinations.",
    keywords: ["LMS", "learning management", "education", "online exams", "training"],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let masterTitle = "Masters Academy";
  try {
    const branding = await getCompanyBrandingLightAction();
    if (branding?.companyName) {
      masterTitle = branding.companyName;
    }
  } catch (err) {}

  return (
    <html
      lang="en"
      className="dark font-sans h-full antialiased"
      suppressHydrationWarning
    >
      <head suppressHydrationWarning>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"){document.documentElement.classList.remove("dark");}else{document.documentElement.classList.add("dark");}}catch(e){document.documentElement.classList.add("dark");}})()`,
          }}
        />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{function escapeHtml(str){if(typeof str!=='string')return'';return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}var title=escapeHtml("${masterTitle}");var rawUser=localStorage.getItem("lms_user");var rawBranding=localStorage.getItem("lms_college_branding");var role=null;if(rawUser){var user=JSON.parse(rawUser);role=user.role;}if(role==='college_admin'||role==='college_student'){if(rawBranding){var branding=JSON.parse(rawBranding);if(branding&&branding.name){title=escapeHtml(branding.name);}}}if(title){document.title=title;}}catch(e){}})()`,
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
