"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Upload, AlertCircle, FileUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Papa from "papaparse";
import { toast } from "sonner";
import { parseStudentsCSV } from "@/lib/services/csv-import-service";

interface SmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SmartImportModal({
  isOpen,
  onClose,
  onSuccess,
}: SmartImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [recommendedMethod, setRecommendedMethod] = useState<"regular" | "queue" | null>(null);
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const THRESHOLD = 5000; // 5K rows threshold

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setAnalyzing(true);
    setRowCount(null);
    setRecommendedMethod(null);

    try {
      // Parse CSV to count rows
      Papa.parse(file, {
        complete: (results) => {
          const totalRows = results.data.length - 1; // Subtract header row
          setRowCount(totalRows);
          setRecommendedMethod(totalRows >= THRESHOLD ? "queue" : "regular");
          setAnalyzing(false);
        },
        error: (error) => {
          console.error("Failed to parse CSV:", error);
          toast.error("Failed to analyze CSV file. Please check the format.");
          setAnalyzing(false);
          setRowCount(null);
          setRecommendedMethod(null);
        },
      });
    } catch (err) {
      console.error("Failed to analyze file:", err);
      toast.error("Failed to analyze file");
      setAnalyzing(false);
    }
  };

  const handleRegularImport = async () => {
    if (!selectedFile) return;

    setImporting(true);
    setImportProgress({ phase: "reading", current: 0, total: 100, message: "Reading CSV file..." });

    try {
      // Get auth token
      const { supabase } = await import("@/lib/supabase/client");
      const { data: sessionData } = await supabase.auth.getSession();
      let adminIdToken = sessionData.session?.access_token || "";
      
      if (!adminIdToken) {
        const refresh = await supabase.auth.refreshSession();
        adminIdToken = refresh.data.session?.access_token || "";
      }
      
      if (!adminIdToken) {
        toast.error("Authentication required. Please log in again.");
        setImporting(false);
        setImportProgress(null);
        return;
      }

      // Read file
      const text = await selectedFile.text();
      
      setImportProgress({ phase: "parsing", current: 0, total: 100, message: "Parsing CSV data..." });
      const rows = parseStudentsCSV(text);
      
      if (rows.length === 0) {
        toast.error("No valid rows found in the CSV");
        setImporting(false);
        setImportProgress(null);
        return;
      }

      setImportProgress({ phase: "importing", current: 0, total: rows.length, message: `Importing ${rows.length} students...` });

      // Import using bulk import API
      const response = await fetch("/api/admin/bulk-import-students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          adminIdToken,
          rows,
          enrollmentType: "csv"
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Import failed");
      }

      setImportProgress(null);
      setImporting(false);

      // Show success message
      toast.success(
        `Import completed! ${result.summary?.createdCount ?? 0} imported, ${result.summary?.duplicateCount ?? 0} duplicates skipped, ${result.summary?.failedCount ?? 0} failed.`,
        { duration: 6000 }
      );

      // Reset and close
      setSelectedFile(null);
      setRowCount(null);
      setRecommendedMethod(null);
      onSuccess();
      onClose();

    } catch (err) {
      console.error("Import failed:", err);
      toast.error(err instanceof Error ? err.message : "Import failed");
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleQueueImport = async () => {
    if (!selectedFile) return;

    setImporting(true);
    setImportProgress({ phase: "reading", current: 0, total: 100, message: "Reading CSV file..." });

    try {
      // Get auth token
      const { supabase } = await import("@/lib/supabase/client");
      const { data: sessionData } = await supabase.auth.getSession();
      let adminIdToken = sessionData.session?.access_token || "";
      
      if (!adminIdToken) {
        const refresh = await supabase.auth.refreshSession();
        adminIdToken = refresh.data.session?.access_token || "";
      }
      
      if (!adminIdToken) {
        toast.error("Authentication required. Please log in again.");
        setImporting(false);
        setImportProgress(null);
        return;
      }

      // Read and parse file
      const text = await selectedFile.text();
      
      setImportProgress({ phase: "parsing", current: 0, total: 100, message: "Parsing CSV data..." });
      const rows = parseStudentsCSV(text);

      if (rows.length === 0) {
        toast.error("No valid rows found in the CSV");
        setImporting(false);
        setImportProgress(null);
        return;
      }

      setImportProgress({ phase: "queuing", current: 0, total: 100, message: "Creating import job..." });

      // Get admin email from localStorage
      const adminEmailRaw = localStorage.getItem("lms_admin_email") || "admin@lms.com";
      const adminEmail = typeof adminEmailRaw === "string" ? adminEmailRaw : "admin@lms.com";

      // Queue the import job
      const response = await fetch("/api/admin/queue-import", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminIdToken}`,
        },
        body: JSON.stringify({
          adminIdToken,
          adminEmail,
          rows,
          enrollmentType: "csv",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to queue import job");
      }

      setImportProgress(null);
      setImporting(false);

      toast.success(
        `Import job queued successfully! ${rows.length} students will be processed in the background.`,
        { duration: 6000 }
      );

      // Reset and close
      setSelectedFile(null);
      setRowCount(null);
      setRecommendedMethod(null);
      onSuccess();
      onClose();

    } catch (err) {
      console.error("Queue import failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to queue import");
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleImport = () => {
    if (!selectedFile || !recommendedMethod || importing) return;

    if (recommendedMethod === "queue") {
      handleQueueImport();
    } else {
      handleRegularImport();
    }
  };

  const handleCancel = () => {
    if (importing) {
      if (!confirm("Import is in progress. Are you sure you want to cancel?")) {
        return;
      }
    }
    
    setSelectedFile(null);
    setRowCount(null);
    setRecommendedMethod(null);
    setAnalyzing(false);
    setImporting(false);
    setImportProgress(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-6">
          <div className="w-full max-w-2xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full rounded-2xl border-2 border-border bg-card shadow-2xl overflow-hidden"
            >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Upload className="w-4 h-4 text-brand" />
                  Smart CSV Import
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload your CSV file and we'll automatically choose the best import method
                </p>
              </div>
              <button
                onClick={handleCancel}
                className="text-muted-foreground hover:text-foreground transition-colors"
                disabled={analyzing || importing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* File Upload Area */}
              {!importing && (
                <div
                  onClick={() => !analyzing && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                    selectedFile
                      ? "border-brand bg-brand/5"
                      : "border-border hover:border-brand/50 hover:bg-muted/30"
                  } ${analyzing ? "opacity-50 cursor-wait" : ""}`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={analyzing}
                  />
                  
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      selectedFile ? "bg-brand text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      <FileUp className="w-6 h-6" />
                    </div>
                    
                    {selectedFile ? (
                      <>
                        <p className="text-sm font-bold text-foreground">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-foreground">
                          Click to select CSV file
                        </p>
                        <p className="text-xs text-muted-foreground">
                          We'll analyze the file and recommend the best import method
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Analysis Results */}
              {analyzing && (
                <div className="bg-muted/50 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Analyzing CSV file...</p>
                    <p className="text-xs text-muted-foreground">Counting rows and optimizing import method</p>
                  </div>
                </div>
              )}

              {/* Import Progress */}
              {importing && importProgress && (
                <div className="bg-brand/10 rounded-xl p-4 border-2 border-brand">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center shrink-0">
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-brand mb-1.5">
                        {importProgress.message}
                      </h4>
                      {importProgress.phase === "importing" && (
                        <div className="space-y-2">
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand transition-all duration-300"
                              style={{
                                width: `${(importProgress.current / importProgress.total) * 100}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {importProgress.current} / {importProgress.total} students
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Recommendation */}
              {rowCount !== null && recommendedMethod && !importing && (
                <div className={`rounded-xl p-4 border-2 ${
                  recommendedMethod === "queue"
                    ? "bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-700"
                    : "bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700"
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      recommendedMethod === "queue"
                        ? "bg-orange-500 text-white"
                        : "bg-blue-500 text-white"
                    }`}>
                      {recommendedMethod === "queue" ? (
                        <Zap className="w-4 h-4" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <h4 className={`text-sm font-bold mb-1 ${
                        recommendedMethod === "queue"
                          ? "text-orange-700 dark:text-orange-300"
                          : "text-blue-700 dark:text-blue-300"
                      }`}>
                        {recommendedMethod === "queue" ? "Queue Import Recommended" : "Standard Import Ready"}
                      </h4>
                      
                      <p className="text-xs text-foreground/80 mb-2">
                        {recommendedMethod === "queue" ? (
                          <>
                            Your file contains <strong className="font-bold">{rowCount.toLocaleString()} students</strong>.
                            We'll use background queue processing for optimal performance.
                          </>
                        ) : (
                          <>
                            Your file contains <strong className="font-bold">{rowCount.toLocaleString()} students</strong>.
                            Standard import will complete in a few seconds.
                          </>
                        )}
                      </p>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                          <span className="text-foreground/70">
                            {recommendedMethod === "queue"
                              ? "Processing in 300-student chunks"
                              : "Direct import with real-time progress"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                          <span className="text-foreground/70">
                            {recommendedMethod === "queue"
                              ? "Real-time progress tracking available"
                              : "Optimized for files under 5,000 rows"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                          <span className="text-foreground/70">
                            {recommendedMethod === "queue"
                              ? "Continues in background"
                              : "Complete in seconds"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Box */}
              {!importing && (
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs text-blue-900 dark:text-blue-200 space-y-2">
                      <p className="font-semibold">CSV Format Requirements:</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-300">
                        <li>Required: <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">name</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">email</code></li>
                        <li>Optional: <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">collegeId</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">department</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">academicYear</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">section</code></li>
                        <li>Automatic: Duplicate emails are skipped with warnings</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 p-4 border-t border-border bg-muted/30">
              <Button
                onClick={handleCancel}
                variant="outline"
                disabled={analyzing || importing}
              >
                {importing ? "Close" : "Cancel"}
              </Button>

              <Button
                onClick={handleImport}
                disabled={!selectedFile || !recommendedMethod || analyzing || importing}
                className={
                  recommendedMethod === "queue"
                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                    : "bg-brand hover:bg-brand/90 text-white"
                }
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" />
                    Importing...
                  </>
                ) : analyzing ? (
                  "Analyzing..."
                ) : recommendedMethod === "queue" ? (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Start Queue Import
                  </>
                ) : recommendedMethod === "regular" ? (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Start Import
                  </>
                ) : (
                  "Select File"
                )}
              </Button>
            </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
