"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { Upload } from "lucide-react";

export function ImportStudentsModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Please select a file to import");
      return;
    }
    setLoading(true);

    try {
      // Read file content
      const text = await file.text();
      
      // Import the correct service
      const { parseStudentsCSV } = await import("@/lib/services/csv-import-service");
      const rows = parseStudentsCSV(text);
      
      if (rows.length === 0) {
        toast.error("No valid rows found in the CSV. Please check the file format.");
        setLoading(false);
        return;
      }

      // Get authentication token
      const { supabase } = await import("@/lib/supabase/client");
      const { data: sessionData } = await supabase.auth.getSession();
      let adminIdToken = sessionData.session?.access_token || "";
      
      if (!adminIdToken) {
        const refresh = await supabase.auth.refreshSession();
        adminIdToken = refresh.data.session?.access_token || "";
      }
      
      if (!adminIdToken) {
        toast.error("Authentication required. Please log in again.");
        setLoading(false);
        return;
      }

      const payload = {
        adminIdToken,
        rows,
        enrollmentType: "csv"
      };

      const res = await fetch("/api/admin/bulk-import-students", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminIdToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || errorData.details || `HTTP ${res.status}`);
      }

      const data = await res.json();
      
      if (!data.success || !data.summary) {
        throw new Error(data.error || "Import failed");
      }
      
      const summary = data.summary;
      const failed = summary.failedCount || 0;
      const success = summary.createdCount || 0;
      const duplicates = summary.duplicateCount || 0;
      const skipped = summary.skippedCount || 0;
      
      if (failed > 0 && success === 0) {
        toast.error(`Import failed for all ${failed} rows. Check console for details.`);
        console.error("Import failures:", summary.results?.filter((r: any) => r.status === "failed"));
      } else if (failed > 0 || duplicates > 0 || skipped > 0) {
        const parts = [];
        if (success > 0) parts.push(`${success} imported`);
        if (duplicates > 0) parts.push(`${duplicates} duplicates`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (failed > 0) parts.push(`${failed} failed`);
        toast.warning(parts.join(", "));
        if (success > 0) {
          onSuccess();
          onClose();
        }
      } else {
        toast.success(`Successfully imported ${success} students!`);
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error("Import error:", err);
      const message = err.message || "An error occurred while importing students.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-lg font-bold text-foreground">Import CSV</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center">
            <Upload className="w-8 h-8 text-muted-foreground mb-3" />
            <h4 className="font-semibold text-foreground mb-1">Upload CSV File</h4>
            <p className="text-xs text-muted-foreground mb-4">
              File must contain: studentName, collegeEmail, college, department, academicYear, section
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-brand/10 file:text-brand
                hover:file:bg-brand/20 cursor-pointer"
            />
            {file && (
              <p className="mt-3 text-xs font-medium text-brand">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={loading || !file} className="bg-brand text-brand-foreground">
            {loading ? "Importing..." : "Import Students"}
          </Button>
        </div>
      </motion.div>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(modalContent, document.body) : null;
}
