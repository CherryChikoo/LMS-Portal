import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";

import { AppProviders } from "@/providers/app-providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

import { getCompanyBrandingLightAction } from "@/lib/actions/branding-actions";

export async function generateMetadata(): Promise<Metadata> {
  // Use a minimal/neutral title server-side.
  // The actual title (college name or admin portal name) is set client-side
  // by the branding-script and BrandingHeadUpdater to avoid flashing
  // the admin portal name for college users.
  let title = " ";
  let isCollegeTenant = false;
  
  try {
    const cookieStore = await cookies();
    const role = cookieStore.get("lms_role")?.value?.toLowerCase();
    if (role === "student" || role === "college_student" || role === "college_admin") {
      isCollegeTenant = true;
    }
  } catch (e) {}

  try {
    if (!isCollegeTenant) {
      const branding = await getCompanyBrandingLightAction();
      if (branding?.companyName) {
        title = branding.companyName;
      }
    }
  } catch (err) {}

  return {
    title: {
      default: title,
      template: "%s",
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
        <Script
          id="bfcache-prevention"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var authPaths=['/dashboard','/admin','/student','/colleges','/students','/exams','/results','/resources','/batches','/settings','/leaderboard','/reports','/announcements','/doubts'];function isAuthPage(){var path=window.location.pathname;if(path==='/login'||path==='/register'||path==='/auth/callback')return false;return authPaths.some(function(p){return path.startsWith(p);});}function checkAuth(){if(!isAuthPage()){document.documentElement.style.visibility='visible';return true;}var auth=localStorage.getItem('lms_auth')||localStorage.getItem('lms_role');if(!auth){document.documentElement.style.visibility='hidden';window.location.href='/login';return false;}document.documentElement.style.visibility='visible';return true;}window.addEventListener('pageshow',function(e){if(e.persisted&&isAuthPage()){checkAuth();}});window.addEventListener('popstate',function(){if(isAuthPage()){checkAuth();}});checkAuth();})()`,
          }}
        />
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"){document.documentElement.classList.remove("dark");}else{document.documentElement.classList.add("dark");}}catch(e){document.documentElement.classList.add("dark");}})()`,
          }}
        />
        <Script
          id="branding-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{function resolveTitle(){try{var masterTitle="${masterTitle}";var title=masterTitle;var rawRole=localStorage.getItem("lms_role");var rawUser=localStorage.getItem("lms_user");var rawBranding=localStorage.getItem("lms_college_branding");var role=rawRole;if(!role&&rawUser){var u=JSON.parse(rawUser);role=u.role;}if(role){role=role.toLowerCase();}if(role==="college_admin"||role==="college_student"||role==="student"){if(rawBranding){var cb=JSON.parse(rawBranding);if(cb&&cb.branding&&cb.branding.companyName){title=cb.branding.companyName;}else if(cb&&cb.name){title=cb.name;}}if(title===masterTitle&&rawUser){var u2=JSON.parse(rawUser);if(u2.collegeName){title=u2.collegeName;}}}return title||masterTitle;}catch(e){return masterTitle;}}var t=resolveTitle();if(t){document.title=t;}window.__lmsResolveTitle=resolveTitle;}catch(e){}})()`,
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
