import type { Metadata } from "next";
import { Inter, Poppins, Montserrat, Manrope } from "next/font/google";
import { AppProviders } from "@/providers/app-providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

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
      className={`${manrope.variable} ${inter.variable} ${poppins.variable} ${montserrat.variable} font-sans h-full antialiased`}
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
