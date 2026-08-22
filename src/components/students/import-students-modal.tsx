"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { Upload, FileSpreadsheet, StopCircle, FolderOpen, Download } from "lucide-react";
import { importStudentsCSV, parseStudentsCSV, generateCredentialsCSV } from "@/lib/services/csv-import-service";
import type { CSVImportSummary } from "@/types";

export function ImportStudentsModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // CSV Import States
  const cancelImportRef = useRef(false);
  const [importing, setImporting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<CSVImportSummary | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | File[]) => {
    let files: File[] = [];
    if (Array.isArray(e)) {
      files = e;
    } else if (e.target.files) {
      files = Array.from(e.target.files);
    }

    if (files.length === 0) return;

    cancelImportRef.current = false;
    setCancelling(false);
    setImporting(true);
    setImportSummary(null);
    setImportProgress({ processed: 0, total: 100 }); // Init to show UI

    try {
      // Process all files
      let allText = "";
      for (const file of files) {
        if (file.name.toLowerCase().endsWith(".csv")) {
          allText += await file.text() + "\n";
        }
      }

      if (!allText.trim()) {
        toast.error("No valid CSV content found in the selected files.");
        setImporting(false);
        setImportProgress(null);
        return;
      }

      const rows = parseStudentsCSV(allText);

      if (rows.length === 0) {
        toast.error("No valid rows found in the CSV. Please check the file format.");
        setImporting(false);
        setImportProgress(null);
        return;
      }

      setImportProgress({ processed: 0, total: rows.length });

      const summary = await importStudentsCSV(
        rows,
        (processed, total) => {
          setImportProgress({ processed, total });
        },
        () => cancelImportRef.current
      );
      
      setImportSummary(summary);
      
      if (cancelImportRef.current) {
        toast.warning(`Import stopped. ${summary.createdCount} students processed successfully.`);
      }

      if (summary.createdCount > 0 || cancelImportRef.current) {
        onSuccess();
      }

    } catch (err: any) {
      console.error("Import error", err);
      toast.error(err.message || "An error occurred during import.");
    } finally {
      setImporting(false);
      setCancelling(false);
      setImportProgress(null);
    }
  };

  const handleDownloadCredentials = () => {
    if (!importSummary) return;
    const csvContent = generateCredentialsCSV(importSummary.results);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `student_credentials_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const modalContent = (
    <div className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 backdrop-blur-md ${importing || importSummary ? 'bg-black/80' : 'bg-black/80'}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-3xl rounded-3xl border-2 border-border bg-card shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-5 sm:p-6 sm:pb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shadow-sm">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Bulk CSV Student Import</h3>
                <p className="text-xs text-muted-foreground">Automatic student accounts & temporary password provisioning</p>
              </div>
            </div>
            <button
              onClick={() => !importing && onClose()}
              disabled={importing}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          {!importSummary && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-accent/40 border border-border text-xs text-muted-foreground space-y-2">
                <p>
                  <strong className="text-foreground">Instructions:</strong> Upload a CSV file containing the following column headers exactly:
                </p>
                <div className="flex flex-wrap gap-1">
                  {["studentName", "collegeEmail", "college", "department", "academicYear", "section", "batch"].map(col => (
                    <code key={col} className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border">{col}</code>
                  ))}
                </div>
                <p>
                  Passwords are dynamically generated by Supabase Auth and will NOT be saved inside the database. 
                  You can download the generated credentials CSV after upload.
                </p>
              </div>

              {importing ? (
                <div className="border-2 border-brand/50 rounded-2xl p-6 text-center space-y-4 bg-brand/5">
                  <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin mx-auto" />
                  <div className="space-y-2">
                    <p className="text-base font-bold text-foreground">
                      {importProgress && importProgress.total > 0
                        ? `Processing Accounts: ${importProgress.processed} / ${importProgress.total} (${Math.round((importProgress.processed / importProgress.total) * 100)}%)`
                        : "Initializing CSV Import..."}
                    </p>
                    {importProgress && importProgress.total > 0 && (
                      <div className="w-full max-w-xs mx-auto bg-border rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-brand h-full transition-all duration-300 rounded-full"
                          style={{ width: `${Math.round((importProgress.processed / importProgress.total) * 100)}%` }}
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Creating and enrolling student accounts safely in batches. Please stay on this page while processing completes.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={cancelling}
                      onClick={() => {
                        setCancelling(true);
                        cancelImportRef.current = true;
                      }}
                      className="flex items-center gap-1.5 mx-auto bg-destructive/20 hover:bg-destructive text-destructive hover:text-white border border-destructive/30"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>{cancelling ? "Stopping import..." : "Stop Import"}</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const droppedFiles: File[] = [];
                    if (e.dataTransfer.items) {
                      const items = Array.from(e.dataTransfer.items);
                      const readEntry = async (entry: any) => {
                        if (entry.isFile) {
                          await new Promise<void>((resolve) => {
                            entry.file((f: File) => {
                              if (f.name.toLowerCase().endsWith(".csv")) droppedFiles.push(f);
                              resolve();
                            });
                          });
                        } else if (entry.isDirectory) {
                          const dirReader = entry.createReader();
                          const entries: any[] = await new Promise((res) => dirReader.readEntries((r: any) => res(r)));
                          for (const sub of entries) {
                            await readEntry(sub);
                          }
                        }
                      };
                      for (let i = 0; i < items.length; i++) {
                        const entry = items[i].webkitGetAsEntry?.();
                        if (entry) await readEntry(entry);
                      }
                    }
                    if (droppedFiles.length > 0) {
                      handleFileUpload(droppedFiles);
                    } else if (e.dataTransfer.files.length > 0) {
                      handleFileUpload(Array.from(e.dataTransfer.files));
                    }
                  }}
                  className="border-2 border-dashed border-border hover:border-brand/70 rounded-2xl p-8 text-center space-y-4 transition-colors bg-background/50"
                >
                  <FileSpreadsheet className="w-10 h-10 text-brand mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Select or Drag & Drop CSV / Data File(s) or Entire Folder</p>
                    <p className="text-xs text-muted-foreground">Upload single files, multiple CSVs, or select a whole folder</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-xs font-bold cursor-pointer hover:bg-brand/90 transition-all shadow-sm">
                      <FileSpreadsheet className="w-4 h-4 shrink-0" />
                      <span>Select CSV / Data File(s)</span>
                      <input
                        type="file"
                        accept=".csv,.txt,.json,.xls,.xlsx,text/csv,text/plain,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        multiple
                        onChange={handleFileUpload}
                        disabled={importing}
                        className="hidden"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground text-xs font-bold cursor-pointer hover:bg-muted transition-all shadow-sm">
                      <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span>Select Entire Folder</span>
                      <input
                        type="file"
                        {...({ webkitdirectory: "", directory: "" } as any)}
                        multiple
                        onChange={handleFileUpload}
                        disabled={importing}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {importSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[11px] text-muted-foreground font-medium">Created</span>
                  <p className="text-xl font-bold text-emerald-500">{importSummary.createdCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <span className="text-[11px] text-muted-foreground font-medium">Duplicates</span>
                  <p className="text-xl font-bold text-amber-500">{importSummary.duplicateCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                  <span className="text-[11px] text-muted-foreground font-medium">Skipped</span>
                  <p className="text-xl font-bold text-slate-400">{importSummary.skippedCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <span className="text-[11px] text-muted-foreground font-medium">Failed</span>
                  <p className="text-xl font-bold text-rose-500">{importSummary.failedCount}</p>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-background/50 text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-4 py-3 bg-card dark:bg-slate-900">Name</th>
                      <th className="px-4 py-3 bg-card dark:bg-slate-900">Email</th>
                      <th className="px-4 py-3 bg-card dark:bg-slate-900">Status</th>
                      <th className="px-4 py-3 bg-card dark:bg-slate-900">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {importSummary.results.map((res, i) => (
                      <tr key={i} className="hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium text-foreground">{res.name}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{res.email}</td>
                        <td className="px-4 py-3">
                          {res.status === "created" && <span className="text-emerald-500 font-bold">Created</span>}
                          {res.status === "duplicate" && <span className="text-amber-500 font-bold">Duplicate</span>}
                          {res.status === "skipped" && <span className="text-slate-400 font-semibold">Skipped</span>}
                          {res.status === "failed" && <span className="text-destructive font-bold">Failed</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{res.reason || `Pass: ${res.password}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border mt-4">
                {importSummary.createdCount > 0 ? (
                  <Button onClick={handleDownloadCredentials} className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-bold shadow-sm">
                    <Download className="w-4 h-4 shrink-0" />
                    <span>Download Credentials CSV ({importSummary.createdCount} Accounts)</span>
                  </Button>
                ) : (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
                    <span>No new accounts created in this batch.</span>
                  </div>
                )}
                <Button onClick={onClose} variant="outline" className="h-11 px-6 rounded-xl font-semibold">
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(modalContent, document.body) : null;
}
