"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { Toaster } from "@/components/ui/sonner";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
