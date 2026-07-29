"use client";

import * as React from "react";
import { useRef, useState, useCallback } from "react";
import { FileSpreadsheet, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CsvUploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function CsvUploadDropzone({ onFilesSelected, disabled = false }: CsvUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFilesAsync = useCallback((files: File[]) => {
    // Yield the thread to allow the native file dialog to close and the UI to update immediately
    setTimeout(() => {
      onFilesSelected(files);
    }, 50);
  }, [onFilesSelected]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const droppedFiles: File[] = [];
    const items = e.dataTransfer.items;
    
    if (items) {
      const readEntry = async (entry: any) => {
        if (entry.isFile) {
          return new Promise<void>((resolve) => {
            entry.file((f: File) => {
              const name = f.name.toLowerCase();
              if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) droppedFiles.push(f);
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
      processFilesAsync(droppedFiles);
    } else if (e.dataTransfer.files.length > 0) {
      processFilesAsync(Array.from(e.dataTransfer.files));
    }
  }, [disabled, processFilesAsync]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("[CsvUploadDropzone] Native file picker returned. Files length:", e.target.files?.length);
    if (e.target.files && e.target.files.length > 0) {
      processFilesAsync(Array.from(e.target.files));
    }
    e.target.value = "";
  }, [processFilesAsync]);

  const openFilePicker = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    console.log("[CsvUploadDropzone] Button Clicked -> Invoking native file picker synchronously");
    fileInputRef.current?.click();
  }, [disabled]);

  const openFolderPicker = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    console.log("[CsvUploadDropzone] Button Clicked -> Invoking native folder picker synchronously");
    folderInputRef.current?.click();
  }, [disabled]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-2xl p-8 text-center space-y-4 transition-colors",
        isDragging ? "border-brand bg-brand/5" : "border-border hover:border-brand/70 bg-background/50",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
    >
      <FileSpreadsheet className={cn(
        "w-10 h-10 mx-auto transition-colors",
        isDragging ? "text-brand" : "text-muted-foreground"
      )} />
      
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Select or Drag & Drop Data File(s) or Entire Folder</p>
        <p className="text-xs text-muted-foreground">Upload single files (CSV, Excel), multiple files, or select a whole folder</p>
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={openFilePicker}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-xs font-bold cursor-pointer hover:bg-brand/90 transition-all shadow-sm disabled:opacity-50"
        >
          <FileSpreadsheet className="w-4 h-4 shrink-0" />
          <span>Select CSV/Excel File(s)</span>
        </button>
        
        <button
          type="button"
          onClick={openFolderPicker}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-foreground border border-border text-xs font-bold cursor-pointer hover:bg-accent/80 transition-all shadow-sm disabled:opacity-50"
        >
          <FolderOpen className="w-4 h-4 text-brand shrink-0" />
          <span>Select Entire Folder</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        multiple
        onChange={handleFileInputChange}
        className="opacity-0 w-0 h-0 absolute pointer-events-none"
        tabIndex={-1}
      />
      <input
        ref={folderInputRef}
        type="file"
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        multiple
        onChange={handleFileInputChange}
        className="opacity-0 w-0 h-0 absolute pointer-events-none"
        tabIndex={-1}
      />
    </div>
  );
}
