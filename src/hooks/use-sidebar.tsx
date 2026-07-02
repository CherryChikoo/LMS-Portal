"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { SIDEBAR_WIDTH } from "@/lib/constants";

interface SidebarContextType {
  isExpanded: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
  openMobile: () => void;
  closeMobile: () => void;
  width: number;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-expanded");
    if (stored !== null) {
      setIsExpanded(stored === "true");
    }
  }, []);

  const toggle = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-expanded", String(next));
      return next;
    });
  }, []);

  const expand = useCallback(() => {
    setIsExpanded(true);
    localStorage.setItem("sidebar-expanded", "true");
  }, []);

  const collapse = useCallback(() => {
    setIsExpanded(false);
    localStorage.setItem("sidebar-expanded", "false");
  }, []);

  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  const width = isExpanded ? SIDEBAR_WIDTH.expanded : SIDEBAR_WIDTH.collapsed;

  return (
    <SidebarContext.Provider
      value={{
        isExpanded,
        isMobileOpen,
        toggle,
        expand,
        collapse,
        openMobile,
        closeMobile,
        width,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}
