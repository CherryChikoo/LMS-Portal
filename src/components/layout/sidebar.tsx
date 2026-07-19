"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Settings,
  LayoutDashboard,
  ClipboardList,
  Trophy,
  FolderOpen,
  Pencil,
  Upload,
  X,
  Check,
  Building2,
  BookOpen,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { useIsDesktop } from "@/hooks/use-media-query";
import { NAVIGATION, APP_NAME } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { logoutUser } from "@/lib/services/auth-service";
import { subscribeToCompanyBranding, updateCompanyBranding, type CompanyBranding } from "@/lib/services/branding-service";

export function Sidebar() {
  const pathname = usePathname();
  const { isExpanded, toggle } = useSidebar();
  const isDesktop = useIsDesktop();
  const [userRole, setUserRole] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const role = localStorage.getItem("lms_role");
      return role ? role.toLowerCase() : null;
    } catch {
      return null;
    }
  });

  const [branding, setBranding] = useState<CompanyBranding>({
    companyName: APP_NAME,
    companySubtitle: "Enterprise v2.4",
  });
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editLogo, setEditLogo] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);

  useEffect(() => {
    const unsub = subscribeToCompanyBranding((data) => {
      setBranding(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const checkRole = () => {
      try {
        const role = localStorage.getItem("lms_role");
        setUserRole(role ? role.toLowerCase() : null);
      } catch {
        setUserRole(null);
      }
    };
    checkRole();
    window.addEventListener("storage", checkRole);
    return () => window.removeEventListener("storage", checkRole);
  }, []);

  const handleLogout = async () => {
    try { await logoutUser(); } catch {}
  };

  const handleOpenBrandModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditName(branding.companyName || APP_NAME);
    setEditSubtitle(branding.companySubtitle || "Enterprise v2.4");
    setEditLogo(branding.logoBase64 || "");
    setShowBrandModal(true);
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      await updateCompanyBranding({
        companyName: editName.trim() || APP_NAME,
        companySubtitle: editSubtitle.trim() || "Enterprise v2.4",
        logoBase64: editLogo,
      });
      setShowBrandModal(false);
    } catch (err) {
      console.error("Failed to save branding:", err);
    } finally {
      setSavingBrand(false);
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 300;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/png");
        setEditLogo(base64);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const effectiveNav = useMemo(() => {
    if (!userRole) return [];
    const base = userRole === "student" ? [
      {
        title: "Academic Portal",
        items: [
          { title: "My Dashboard", href: "/", icon: LayoutDashboard },
        ]
      },
      {
        title: "Examinations",
        items: [
          { title: "Assigned Tests", href: "/exams", icon: ClipboardList },
          { title: "My Test Results", href: "/results", icon: Trophy },
          { title: "Leaderboard", href: "/leaderboard", icon: Trophy },
        ]
      },
      {
        title: "Study Resources",
        items: [
          { title: "Course Material", href: "/resources", icon: FolderOpen },
        ]
      }
    ] : NAVIGATION;

    let filteredBase = base;
    if (userRole === "college_admin") {
      filteredBase = base.map(sec => ({
        ...sec,
        items: sec.items.filter(it => it.href !== "/colleges" && it.href !== "/audit")
      })).filter(sec => sec.items.length > 0);
    }

    const prefix = userRole === "student" ? "/student" : "/admin";
    return filteredBase.map((sec) => ({
      ...sec,
      items: sec.items.map((it) => ({
        ...it,
        href: it.href === "/" && userRole === "college_admin" ? "/" : it.href === "/" ? prefix : `${prefix}${it.href}`,
      })),
    }));
  }, [userRole]);

  if (!isDesktop) return null;

  return (
    <motion.aside
      initial={false}
      animate={{ width: isExpanded ? 260 : 80 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="fixed left-0 top-0 bottom-0 z-30 flex flex-col bg-sidebar backdrop-blur-2xl text-sidebar-foreground transition-all duration-300 border-r border-border/40"
      style={{ fontFamily: '"Montserrat", sans-serif' }}
    >
      {/* Logo & Top Collapse Toggle Area */}
      <div className={cn("flex items-center h-20 px-4 shrink-0 border-b border-border/30 relative group/brand", isExpanded ? "justify-between" : "justify-center")}>
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0 mr-1">
          {branding.logoBase64 ? (
            <img
              src={branding.logoBase64}
              alt="Company Logo"
              className={cn("object-contain rounded-lg shrink-0", isExpanded ? "w-8 h-8" : "w-7 h-7 mx-auto")}
            />
          ) : !isExpanded ? (
            <div className="w-8 h-8 text-brand flex items-center justify-center mx-auto shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
          ) : null}
          {isExpanded && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-lg text-brand tracking-tight truncate flex items-center gap-2">
                {branding.companyName || APP_NAME} <BookOpen className="w-5 h-5" />
              </span>
              <span className="text-[9px] font-bold text-brand/60 uppercase tracking-widest truncate">
                {userRole === "student" ? "Student Portal" : branding.companySubtitle || "Enterprise"}
              </span>
            </div>
          )}
        </Link>

        {/* Admin Quick-Edit Branding Button */}
        {isExpanded && userRole && userRole !== "student" && (
          <button
            type="button"
            onClick={handleOpenBrandModal}
            title="Edit Company Branding & Logo"
            className="opacity-0 group-hover/brand:opacity-100 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all shrink-0 mr-1"
          >
            <Pencil className="w-3.5 h-3.5 text-brand" />
          </button>
        )}

      </div>

      {/* Navigation Links & Settings Inside ScrollArea with pb-12 so nothing is ever obscured by OS taskbar */}
      <ScrollArea className="flex-1 min-h-0 px-3 py-3 pb-2">
        <nav className="space-y-5 pb-4">
          {effectiveNav.map((section) => (
            <div key={section.title}>
              <AnimatePresence>
                {isExpanded && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3.5"
                  >
                    {section.title}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/admin" && item.href !== "/student" && pathname.startsWith(item.href + "/"));
                  const Icon = item.icon;

                  const linkContent = (
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-brand text-black shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                        !isExpanded && "justify-center px-0 w-11 h-11 mx-auto"
                      )}
                    >
                      <Icon
                        className={cn(
                          "shrink-0 transition-transform duration-200 group-hover:scale-110",
                          isActive ? "text-black w-5 h-5" : "text-muted-foreground group-hover:text-foreground w-5 h-5"
                        )}
                      />
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2 }}
                            className="whitespace-nowrap overflow-hidden flex-1"
                          >
                            {item.title}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {isExpanded && item.badge && (
                        <span className="ml-auto text-[11px] bg-brand/20 text-brand px-2 py-0.5 rounded-full font-semibold border border-brand/30">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );

                  if (!isExpanded) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger render={linkContent} />
                        <TooltipContent side="right" sideOffset={14} className="glass-popover border-white/10 font-medium">
                          {item.title}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={item.href}>{linkContent}</div>;
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Settings Footer (Fixed at bottom) */}
      <div className="shrink-0 pt-3 mt-auto border-t border-border/40 px-3 pb-4 space-y-1">
        {isExpanded && (
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60 mb-2 px-3.5">
            SETTINGS
          </p>
        )}

        {!isExpanded ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={userRole === "student" ? "/student/settings" : "/admin/settings"}
                  className="group relative flex items-center justify-center w-11 h-11 mx-auto rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  <Settings className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>
              }
            />
            <TooltipContent side="right" sideOffset={14} className="glass-popover font-heading">
              Settings
            </TooltipContent>
          </Tooltip>
        ) : (
          <Link
            href={userRole === "student" ? "/student/settings" : "/admin/settings"}
            className="group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <Settings className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="whitespace-nowrap">Settings</span>
          </Link>
        )}

        {!isExpanded ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  onClick={handleLogout}
                  className="w-full group relative flex items-center justify-center w-11 h-11 mx-auto rounded-lg text-sm font-medium transition-all duration-200 text-rose-500 hover:bg-rose-500/10 mt-1"
                >
                  <LogOut className="w-5 h-5 shrink-0 text-rose-500" />
                </button>
              }
            />
            <TooltipContent side="right" sideOffset={14} className="glass-popover font-heading text-orange-500">
              Logout
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-rose-500 hover:bg-rose-500/10 mt-1"
          >
            <LogOut className="w-5 h-5 shrink-0 text-rose-500" />
            <span className="whitespace-nowrap">Logout</span>
          </button>
        )}
      </div>

      {/* Edit Company Branding Modal — portal-rendered to escape sidebar stacking context */}
      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {showBrandModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 text-foreground font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold">Company Branding & Logo</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBrandModal(false)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveBranding} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Company Logo (Base64)</label>
                  <div className="flex items-center gap-4 p-3 rounded-xl border border-border/80 bg-background/50">
                    {editLogo ? (
                      <div className="relative w-14 h-14 rounded-lg border border-border bg-card flex items-center justify-center overflow-hidden shrink-0">
                        <img src={editLogo} alt="Logo preview" className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setEditLogo("")}
                          className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 shadow hover:bg-rose-600"
                          title="Remove Logo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground shrink-0 bg-muted/20">
                        <Building2 className="w-6 h-6 opacity-40" />
                        <span className="text-[9px] mt-0.5">No Logo</span>
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{editLogo ? "Change Logo" : "Upload Logo"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileChange}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        PNG, JPG, or SVG. Automatically resized & stored in base64 format for global visibility.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Company / Portal Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    placeholder="e.g. Acme Institute LMS"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Subtitle / Tagline</label>
                  <input
                    type="text"
                    value={editSubtitle}
                    onChange={(e) => setEditSubtitle(e.target.value)}
                    placeholder="e.g. Enterprise v2.4"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowBrandModal(false)}
                    className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingBrand}
                    className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-md"
                  >
                    {savingBrand ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save to Firebase</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body)}
    </motion.aside>
  );
}
