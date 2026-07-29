"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { BrandingProvider } from "./branding-provider";
import { Toaster } from "@/components/ui/sonner";

import { ErrorProvider } from "./error-provider";
import { BrandingHeadUpdater } from "@/components/shared/branding-head-updater";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <ErrorProvider>
        <BrandingProvider>
          <BrandingHeadUpdater />
          <SidebarProvider>
            {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className:
                "glass-card border-white/10 dark:border-white/10 text-foreground",
            }}
          />
        </SidebarProvider>
        </BrandingProvider>
      </ErrorProvider>
    </ThemeProvider>
  );
}
