"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { parseStudentsCSV } from "@/lib/services/csv-import-service";

interface QueueImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  totalRows: number;
  processedRows: number;
  successCount: number;
  failedCount: number;
  duplicateCount: number;
  progress: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export function QueueImportModal({ isOpen, onClose, onSuccess }: QueueImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".csv")) {
        toast.error("Please select a CSV file");
        return;
      }
      setFile(selectedFile);
    }
  };

  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/admin/queue-import?jobId=${jobId}`);
      const data = await response.json();

      if (data.success && data.job) {
        setJobStatus(data.job);

        // Stop polling if completed or failed
        if (data.job.status === "completed" || data.job.status === "failed") {
          setIsPolling(false);
          
          if (data.job.status === "completed") {
            toast.success(
              `Import completed! ${data.job.successCount} students imported, ` +
              `${data.job.duplicateCount} duplicates, ${data.job.failedCount} failed.`
            );
            setTimeout(() => {
              onSuccess();
              handleClose();
            }, 2000);
          } else {
            toast.error(`Import failed: ${data.job.errorMessage || "Unknown error"}`);
          }
        }
      }
    } catch (error) {
      console.error("Failed to poll job status:", error);
    }
  }, [onSuccess]);

  useEffect(() => {
    if (isPolling && jobStatus?.jobId) {
      const interval = setInterval(() => {
        pollJobStatus(jobStatus.jobId);
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [isPolling, jobStatus?.jobId, pollJobStatus]);

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Please select a CSV file");
      return;
    }

    setIsSubmitting(true);

    try {
      // Parse CSV
      const text = await file.text();
      const parsedData = parseStudentsCSV(text);

      if (parsedData.length === 0) {
        toast.error("No valid rows found in the CSV. Please check the file format.");
        setIsSubmitting(false);
        return;
      }

      // Get auth token
      const sessionData = await supabase.auth.getSession();
      let adminIdToken = sessionData.data.session?.access_token || "";
      
      if (!adminIdToken) {
        const refresh = await supabase.auth.refreshSession();
        adminIdToken = refresh.data.session?.access_token || "";
      }

      if (!adminIdToken) {
        toast.error("Authentication required. Please log in again.");
        setIsSubmitting(false);
        return;
      }

      // Get admin email
      const { data: userData } = await supabase.auth.getUser();
      const adminEmail = userData?.user?.email || "unknown";

      // Queue the import job
      const response = await fetch("/api/admin/queue-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminIdToken}`,
        },
        body: JSON.stringify({
          adminIdToken,
          rows: parsedData,
          enrollmentType: "csv",
          adminEmail,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      toast.success(
        `Import job queued! Processing ${parsedData.length} students. ` +
        `Estimated time: ${result.estimatedTime}`
      );

      // Start polling for status
      setJobStatus({
        jobId: result.jobId,
        status: "queued",
        totalRows: parsedData.length,
        processedRows: 0,
        successCount: 0,
        failedCount: 0,
        duplicateCount: 0,
        progress: 0,
      });
      setIsPolling(true);

    } catch (error: any) {
      console.error("Queue import error:", error);
      toast.error(error.message || "Failed to queue import job");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isPolling) {
      toast.info("Import is still processing in the background. You can close this and check back later.");
    }
    setFile(null);
    setJobStatus(null);
    setIsPolling(false);
    onClose();
  };

  const getStatusIcon = () => {
    if (!jobStatus) return null;
    
    switch (jobStatus.status) {
      case "queued":
        return <Clock className="h-5 w-5 text-blue-500" />;
      case "processing":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    if (!jobStatus) return "";
    
    switch (jobStatus.status) {
      case "queued":
        return "Queued - Waiting to start...";
      case "processing":
        return `Processing ${jobStatus.processedRows} / ${jobStatus.totalRows} students (${jobStatus.progress}%)`;
      case "completed":
        return "Import completed successfully!";
      case "failed":
        return `Import failed: ${jobStatus.errorMessage || "Unknown error"}`;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Queue Large CSV Import (25K+ Students)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={isSubmitting || isPolling}
            />
            {file && (
              <p className="text-sm text-gray-600">
                Selected: {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>

          {jobStatus && (
            <div className="space-y-3 rounded-lg border p-4 bg-gray-50">
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <span className="font-medium">{getStatusText()}</span>
              </div>

              {jobStatus.status === "processing" && (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${jobStatus.progress}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-600 grid grid-cols-3 gap-2">
                    <div>✅ Success: {jobStatus.successCount}</div>
                    <div>🔄 Duplicates: {jobStatus.duplicateCount}</div>
                    <div>❌ Failed: {jobStatus.failedCount}</div>
                  </div>
                </>
              )}

              {jobStatus.status === "completed" && (
                <div className="text-sm space-y-1">
                  <div className="text-green-600">✅ Successfully imported: {jobStatus.successCount}</div>
                  <div className="text-yellow-600">🔄 Duplicates skipped: {jobStatus.duplicateCount}</div>
                  <div className="text-red-600">❌ Failed: {jobStatus.failedCount}</div>
                </div>
              )}
            </div>
          )}

          <div className="text-sm text-gray-600 space-y-1">
            <p className="font-medium">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Upload your CSV (even 25K+ students)</li>
              <li>Job is queued and processed in the background</li>
              <li>Real-time progress shown here</li>
              <li>No timeout issues - processes in chunks</li>
              <li>You can close this and check back later</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            {isPolling ? "Close (Background)" : "Cancel"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || isSubmitting || isPolling}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Queuing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Queue Import
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
