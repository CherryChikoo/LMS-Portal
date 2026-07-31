"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Building2, Upload, X, Check } from "lucide-react";
import { doc, setDoc, serverTimestamp, getDocuments } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { updateCompanyBranding } from "@/lib/services/branding-service";
import { updateCollege, renameCollegeAndMigrate } from "@/lib/services/college-service";
import { useBranding } from "@/providers/branding-provider";
import { APP_NAME } from "@/lib/constants";

interface BrandingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BrandingModal({ isOpen, onClose }: BrandingModalProps) {
  const { branding, loading } = useBranding();
  const [editName, setEditName] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editLogo, setEditLogo] = useState("");
  const [userCollegeName, setUserCollegeName] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync form state when modal opens or branding resolves
  useEffect(() => {
    if (isOpen) {
      setEditName(branding.companyName || "");
      setEditSubtitle(branding.companySubtitle || "");
      setEditLogo(branding.logoBase64 || "");
      try {
        const uStr = typeof window !== "undefined" ? (localStorage.getItem("lms_user") || localStorage.getItem("user")) : null;
        const parsed = uStr ? JSON.parse(uStr) : null;
        setUserCollegeName(parsed?.collegeName || "");
      } catch {}
    }
  }, [isOpen, branding]);

  const handleExited = () => {
    setEditName(branding.companyName || "");
    setEditSubtitle(branding.companySubtitle || "");
    setEditLogo(branding.logoBase64 || "");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      const u = uStr ? JSON.parse(uStr) : null;
      const cId = u?.collegeId;
      const userRole = localStorage.getItem("lms_role") || u?.role;

      if (userRole === "college_admin" || (cId && cId !== "global")) {
        const allCols = await getDocuments<import("@/types").College>("colleges");
        const cleanSlug = (v?: string) => (v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "");
        const searchSlug = cleanSlug(cId || u?.collegeName || editName);
        const searchEmail = (u?.email || "").toLowerCase().trim();

        const colDoc = allCols.find((c) =>
          c.id === cId ||
          cleanSlug(c.id) === searchSlug ||
          cleanSlug(c.name) === searchSlug ||
          (searchEmail && c.adminEmail && c.adminEmail.toLowerCase().trim() === searchEmail)
        );

        const targetColId = colDoc ? colDoc.id : cId;
        if (!targetColId) throw new Error("No college ID associated with this admin.");

        const collegeRef = doc(db, "colleges", targetColId);
        const newCollegeName = editName.trim().toLowerCase();

        const cBrand = {
          companyName: editName.trim(),
          companySubtitle: editSubtitle.trim() || "College Portal",
          logoBase64: editLogo,
          updatedAt: serverTimestamp(),
        };

        await setDoc(
          collegeRef,
          {
            name: newCollegeName,
            branding: cBrand,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        // Migrate all students, users, exams, and resources to the new lower-case college name
        if (colDoc && colDoc.name && colDoc.name.toLowerCase() !== newCollegeName) {
          await renameCollegeAndMigrate(targetColId, colDoc.name, newCollegeName, (colDoc as any).isExternal || false);
        }

        // Update user profile in localStorage with updated college information
        if (u) {
          u.collegeId = targetColId;
          u.collegeName = newCollegeName;
          localStorage.setItem("lms_user", JSON.stringify(u));
          localStorage.setItem("user", JSON.stringify(u));
        }

        localStorage.setItem("lms_college_branding", JSON.stringify({ collegeId: targetColId, branding: cBrand }));
        window.dispatchEvent(new Event("storage"));
      } else {
        await updateCompanyBranding({
          companyName: editName.trim(),
          companySubtitle: editSubtitle.trim(),
          logoBase64: editLogo,
        });
      }
      onClose();
    } catch (err) {
      console.error("Failed to save branding:", err);
    } finally {
      setSaving(false);
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence onExitComplete={handleExited}>
      {isOpen && (
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
                <h3 className="text-lg font-bold">
                  {typeof window !== "undefined" && localStorage.getItem("lms_role") === "college_admin" 
                    ? "College Branding & Logo" 
                    : "Company Branding & Logo"}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold">
                  {typeof window !== "undefined" && localStorage.getItem("lms_role") === "college_admin" 
                    ? "College Logo (Base64)" 
                    : "Company Logo (Base64)"}
                </label>
                <div className="flex items-center gap-4 p-3 rounded-xl border border-border/80 bg-background/50">
                  {editLogo ? (
                    <div className="relative w-14 h-14 shrink-0">
                      <div className="w-full h-full rounded-lg border border-border bg-card flex items-center justify-center overflow-hidden">
                        <img src={editLogo} alt="Logo preview" className="w-full h-full object-contain" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditLogo("")}
                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 shadow-md hover:bg-rose-600 z-10"
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
                      {typeof window !== "undefined" && localStorage.getItem("lms_role") === "college_admin"
                        ? "PNG, JPG, or SVG. Automatically resized & stored in base64 format for college visibility."
                        : "PNG, JPG, or SVG. Automatically resized & stored in base64 format for global visibility."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  {typeof window !== "undefined" && localStorage.getItem("lms_role") === "college_admin" 
                    ? "College Name (Set by Admin)" 
                    : "Company / Portal Name"}
                </label>
                {typeof window !== "undefined" && localStorage.getItem("lms_role") === "college_admin" ? (
                  <div className="w-full h-10 px-3 flex items-center rounded-xl border border-border/80 bg-muted/30 text-sm font-bold text-foreground capitalize">
                    {editName || branding.companyName || userCollegeName || "College"}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    placeholder="e.g. Acme Institute LMS"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                )}
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
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-brand text-brand-foreground text-xs font-bold hover:bg-brand/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-md"
                >
                  {saving ? (
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
    document.body
  );
}
