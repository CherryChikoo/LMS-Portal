"use client";

import { upsertCollegeAction } from "@/lib/actions/college-actions";
import { getCollegeAdminsAction } from "@/lib/actions/auth-actions";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { GraduationCap, Plus, Building2, Layers, Users, FolderTree, ChevronRight, Trash2, Pencil, KeyRound, Loader2, Upload, FileSpreadsheet, FolderOpen, StopCircle, Download } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllColleges, createCollege, deleteCollege, getAllStudents, deleteStudentProfile, updateCollege, updateStudentProfile, renameCollegeAndMigrate, PREDEFINED_DEPARTMENTS, ensureGeneralDepartment, createStudentAuthProfile, importStudentsCSV, parseStudentsCSV, generateCredentialsCSV } from "@/lib/services";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";
import { refreshCache, optimisticUpdateCollegeInCache, optimisticDeleteCollegeFromCache as optimisticDeleteCollege } from "@/lib/data/lms-data-cache";
import { markCollegeAsDeleted } from "@/lib/hierarchy/hierarchy-data";
import type { College, Student, CSVStudentRow, CSVImportSummary } from "@/types";
import { useErrorHandler } from "@/providers/error-provider";

export default function CollegesPage() {
  const colleges = useLMSDataSelector((s) => s.filteredColleges);
  const externalColleges = useLMSDataSelector((s) => s.externalInstitutions);
  const allStudents = useLMSDataSelector((s) => s.students);
  const lmsLoading = useLMSDataSelector((s) => s.loading);
  const { showError } = useErrorHandler();

  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [selectedExternalIds, setSelectedExternalIds] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [isGlobalDeleting, setIsGlobalDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; confirmText?: string; isAlert?: boolean; variant?: "destructive" | "success"; onConfirm: () => void } | null>(null);
  const [name, setName] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["Computer Science & Engineering (CSE)", "General"]);
  const [customDeptName, setCustomDeptName] = useState<string>("");
  const [adminEmail, setAdminEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [creating, setCreating] = useState(false);

  // Separate State: Rename College Modal
  const [renamingCollege, setRenamingCollege] = useState<College | null>(null);
  const [renameCollegeName, setRenameCollegeName] = useState("");
  const [renamingLoading, setRenamingLoading] = useState(false);

  // Separate State: Manage Admin Credentials Modal
  const [credsCollege, setCredsCollege] = useState<College | null>(null);
  const [credsAdminEmail, setCredsAdminEmail] = useState("");
  const [credsPassword, setCredsPassword] = useState("");
  const [credsLoginEnabled, setCredsLoginEnabled] = useState(false);
  const [credsLoading, setCredsLoading] = useState(false);

  const [editingExternal, setEditingExternal] = useState<{ id: string; name: string } | null>(null);
  const [editExternalName, setEditExternalName] = useState("");
  const [updatingExternal, setUpdatingExternal] = useState(false);
  const [successPopup, setSuccessPopup] = useState("");

  // College Card Enroll & Import State
  const [selectedCollegeForAction, setSelectedCollegeForAction] = useState<College | { id: string; name: string } | null>(null);
  const [showCardEnrollModal, setShowCardEnrollModal] = useState(false);
  const [cardEnrollName, setCardEnrollName] = useState("");
  const [cardEnrollEmail, setCardEnrollEmail] = useState("");
  const [cardEnrollDept, setCardEnrollDept] = useState("");
  const [cardEnrollYear, setCardEnrollYear] = useState("1st Year");
  const [cardEnrollSection, setCardEnrollSection] = useState("A");
  const [cardCustomSection, setCardCustomSection] = useState("");
  const [cardEnrollBatch, setCardEnrollBatch] = useState("");
  const [cardEnrolling, setCardEnrolling] = useState(false);
  const [cardEnrollError, setCardEnrollError] = useState<string | null>(null);

  const [showCardImportModal, setShowCardImportModal] = useState(false);
  const [cardImporting, setCardImporting] = useState(false);
  const [cardCancelling, setCardCancelling] = useState(false);
  const [cardImportProgress, setCardImportProgress] = useState<{ processed: number; total: number } | null>(null);
  const [cardImportSummary, setCardImportSummary] = useState<CSVImportSummary | null>(null);
  const cardCancelImportRef = useRef(false);

  const handleOpenEnrollForCollege = (col: College | { id: string; name: string }) => {
    setSelectedCollegeForAction(col);
    const depts = (col as College).departments || ["Computer Science & Engineering (CSE)"];
    setCardEnrollDept(depts[0] || "Computer Science & Engineering (CSE)");
    setCardEnrollName("");
    setCardEnrollEmail("");
    setCardCustomSection("");
    setCardEnrollError(null);
    setShowCardEnrollModal(true);
  };

  const handleOpenImportForCollege = (col: College | { id: string; name: string }) => {
    setSelectedCollegeForAction(col);
    setCardImportSummary(null);
    setShowCardImportModal(true);
  };

  const handleCreateStudentFromCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollegeForAction || !cardEnrollName || !cardEnrollEmail || !cardEnrollDept) return;
    setCardEnrolling(true);
    setCardEnrollError(null);
    try {
      await createStudentAuthProfile({
        name: cardEnrollName.trim(),
        email: cardEnrollEmail.toLowerCase().trim(),
        collegeId: selectedCollegeForAction.id,
        collegeName: selectedCollegeForAction.name,
        department: cardEnrollDept,
        academicYear: cardEnrollYear,
        section: cardEnrollSection === "CUSTOM" ? cardCustomSection.trim() || "A" : cardEnrollSection,
        batch: cardEnrollBatch,
      });

      const fullCol = colleges.find((c) => c.id === selectedCollegeForAction.id);
      if (fullCol) {
        await updateCollege(fullCol.id, {
          studentCount: (fullCol.studentCount || 0) + 1,
        });
      }

      toast.success(`Successfully enrolled ${cardEnrollName} in ${selectedCollegeForAction.name}.`);
      await refreshCache(); // Immediate UI update
      setShowCardEnrollModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCardEnrollError(msg || "Failed to enroll student.");
    } finally {
      setCardEnrolling(false);
    }
  };

  const handleFileUploadFromCard = async (filesOrEvent: React.ChangeEvent<HTMLInputElement> | File[]) => {
    let files: File[] = [];
    if (Array.isArray(filesOrEvent)) {
      files = filesOrEvent;
    } else if (filesOrEvent.target.files) {
      files = Array.from(filesOrEvent.target.files);
      filesOrEvent.target.value = "";
    }

    if (files.length === 0 || !selectedCollegeForAction) return;

    cardCancelImportRef.current = false;
    setCardCancelling(false);
    setCardImporting(true);
    setCardImportSummary(null);
    setCardImportProgress(null);

    const allRows: CSVStudentRow[] = [];
    let hasUnsupportedExcel = false;
    
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".json") || !name.includes(".")) {
        const text = await file.text();
        const rows = parseStudentsCSV(text);
        rows.forEach((r) => {
          if (!r.college || r.college === "Unassigned") r.college = selectedCollegeForAction.name;
        });
        allRows.push(...rows);
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        hasUnsupportedExcel = true;
        toast.error(`Excel files (.xlsx, .xls) are no longer supported due to security updates. Please convert your file to .csv format and try again.`);
      }
    }

    if (hasUnsupportedExcel && allRows.length === 0) {
      setCardImporting(false);
      return;
    }

    if (allRows.length === 0) {
      toast.error("No valid student rows with email addresses found.");
      setCardImporting(false);
      return;
    }

    try {
      setCardImportProgress({ processed: 0, total: allRows.length });
      const summary = await importStudentsCSV(
        allRows,
        (processed, total) => {
          setCardImportProgress({ processed, total });
        },
        () => cardCancelImportRef.current
      );
      setCardImportSummary(summary);
      await refreshCache(); // Immediate UI update
      toast.success(`Import complete for ${selectedCollegeForAction.name}.`);
    } catch (err) {
      console.error("Import error", err);
      toast.error("Failed to import CSV.");
    } finally {
      setCardImporting(false);
      setCardCancelling(false);
      setCardImportProgress(null);
    }
  };

  const handleDownloadCardCredentials = () => {
    if (!cardImportSummary) return;
    const csvContent = generateCredentialsCSV(cardImportSummary.results);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedCollegeForAction?.name || "college"}_credentials_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };



  useEffect(() => {
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed.role === "college_admin" && parsed.collegeId) {
          window.location.replace(`/colleges/${parsed.collegeId}`);
        }
      }
    } catch (_) {}

    // OPTIMIZATION: Removed automatic normalize-colleges sweep to prevent expensive 
    // full-collection scans on every page load. This operation should only be run 
    // manually when needed via a dedicated admin maintenance button.
  }, []);

  const handleDeleteAdminCollege = (col: College) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Partner Institution",
      message: `Are you sure you want to permanently delete "${col.name}"? This action will also delete all students, departments, and associated data. This cannot be undone.`,
      onConfirm: async () => {
        try {
          setIsGlobalDeleting(true);

          // Server-side cascading deletion
          await deleteCollege(col.id);

          // Immediate cache refresh
          await refreshCache();
          
          setIsGlobalDeleting(false);
          
          // Show native browser alert as requested
          setTimeout(() => {
            toast.success(`College "${col.name}" deleted successfully.`);
          }, 100);
        } catch (err: unknown) {
          setIsGlobalDeleting(false);
          console.error("Failed to delete college:", err);
          toast.error(err instanceof Error ? err.message : "Failed to delete college");
        }
      }
    });
  };

  const handleToggleCollegeStatus = async (col: College) => {
    const isRestricted = col.status === "restricted";
    setConfirmConfig({
      isOpen: true,
      title: isRestricted ? "Unrestrict Partner Institution" : "Restrict Partner Institution",
      message: isRestricted 
        ? `Are you sure you want to restore access to "${col.name}"? Their College Admin will be able to log in again.`
        : `Are you sure you want to restrict "${col.name}"? Their College Admin will immediately lose access to the portal.`,
      confirmText: isRestricted ? "Unrestrict" : "Restrict",
      onConfirm: async () => {
        try {
          const newStatus = isRestricted ? "active" : "restricted";
          optimisticUpdateCollegeInCache(col.id, { status: newStatus });
          await updateCollege(col.id, { status: newStatus });
          await refreshCache(); // Immediate UI update
          toast.success(isRestricted ? `Access restored for "${col.name}".` : `Access restricted for "${col.name}".`);
        } catch (err) {
          console.error("Failed to toggle college status:", err);
          await refreshCache();
          toast.error("Failed to toggle college status.");
        }
      }
    });
  };

  const handleDeleteSelectedAdminColleges = () => {
    if (selectedAdminIds.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete Selected Colleges",
      message: `Are you sure you want to delete ${selectedAdminIds.length} selected admin college(s)?`,
      onConfirm: async () => {
        try {
          const idsToDelete = [...selectedAdminIds];
          setIsGlobalDeleting(true);

          // Instant Firestore document deletion for each college (this properly calls the API until completion)
          await Promise.all(idsToDelete.map((id) => deleteCollege(id)));

          // Immediate cache refresh
          await refreshCache();
          
          setIsGlobalDeleting(false);
          setSelectedAdminIds([]);
          
          // Show native browser alert
          setTimeout(() => {
            toast.success("Selected colleges deleted successfully.");
          }, 100);
        } catch (err: unknown) {
          setIsGlobalDeleting(false);
          console.error("Failed to delete selected colleges:", err);
          toast.error(err instanceof Error ? err.message : "Failed to delete selected colleges");
        }
      }
    });
  };

  const handleDeleteExternalCollege = (extIdOrName: string, explicitName?: string) => {
    const foundCol = externalColleges.find((c) => c.id === extIdOrName || c.name === extIdOrName);
    const resolvedName = explicitName || foundCol?.name || (extIdOrName.startsWith("col-") ? (foundCol?.name || extIdOrName.replace(/^col-/, "")) : extIdOrName);
    const extId = foundCol?.id || extIdOrName;
    const extName = foundCol?.name || resolvedName;

    const studentsToDelete = allStudents.filter(
      (s) => s.collegeName === extName || s.collegeId === extId || s.collegeName === extId || s.collegeId === extName || s.collegeName?.toLowerCase() === extName.toLowerCase()
    );
    setConfirmConfig({
      isOpen: true,
      title: "Delete Outside Institution",
      message: `Are you sure you want to delete outside institution "${resolvedName}" along with its ${studentsToDelete.length} enrolled student profile(s)?`,
      onConfirm: async () => {
        try {
          setIsGlobalDeleting(true);
          markCollegeAsDeleted(extId);
          markCollegeAsDeleted(extName);
          setDeletingIds((prev) => [...prev, extId, extName, resolvedName]);
          setSelectedExternalIds((prev) => prev.filter((id) => id !== extId && id !== extName));

          // Call the unified deleteCollege API which handles external colleges and batch deletes everything efficiently
          await deleteCollege(extId, undefined, studentsToDelete.map(s => s.id));
          
          await refreshCache(); // Immediate UI update
          
          setIsGlobalDeleting(false);
          
          setTimeout(() => {
            toast.success(`Outside institution "${resolvedName}" deleted successfully.`);
          }, 100);
        } catch (err) {
          setIsGlobalDeleting(false);
          console.error("Failed to delete outside institution:", err);
          toast.error("Failed to delete outside institution.");
        } finally {
          setDeletingIds((prev) => prev.filter((id) => id !== extId && id !== extName && id !== resolvedName));
        }
      }
    });
  };

  const handleDeleteSelectedExternalColleges = () => {
    if (selectedExternalIds.length === 0) return;
    const studentsToDelete = allStudents.filter(
      (s) =>
        (s.collegeName && selectedExternalIds.includes(s.collegeName)) ||
        (s.collegeId && selectedExternalIds.includes(s.collegeId)) ||
        (s.collegeName && selectedExternalIds.map((e) => e.toLowerCase()).includes(s.collegeName.toLowerCase()))
    );
    setConfirmConfig({
      isOpen: true,
      title: "Delete Selected Outside Institutions",
      message: `Are you sure you want to delete ${selectedExternalIds.length} selected outside institution(s) along with ${studentsToDelete.length} enrolled student profile(s)?`,
      onConfirm: async () => {
        try {
          setIsGlobalDeleting(true);
          const promises: Promise<any>[] = [];
          selectedExternalIds.forEach((extName) => {
            markCollegeAsDeleted(extName);
            const uidsForThisCollege = studentsToDelete
              .filter(s => s.collegeName === extName || s.collegeId === extName || s.collegeName?.toLowerCase() === extName.toLowerCase())
              .map(s => s.id);
            promises.push(deleteCollege(extName, undefined, uidsForThisCollege));
            // Removed optimisticDeleteCollege so the cards stay mounted and show spinners
          });
          setSelectedExternalIds([]);

          await Promise.all(promises);
          await refreshCache(); // Immediate UI update
          
          setIsGlobalDeleting(false);
          
          setTimeout(() => {
            toast.success("Selected outside institutions deleted.");
          }, 100);
        } catch (err) {
          setIsGlobalDeleting(false);
          console.error("Failed to delete selected outside institutions:", err);
          toast.error("Failed to delete selected outside institutions.");
        }
      }
    });
  };

  const handleDeleteAllExternalColleges = () => {
    if (externalColleges.length === 0) return;
    const allExternalNames: string[] = externalColleges.map((c) => c.name);
    const studentsToDelete = allStudents.filter(
      (s) =>
        (s.collegeName && allExternalNames.includes(s.collegeName)) ||
        (s.collegeId && allExternalNames.includes(s.collegeId)) ||
        (s.collegeName && allExternalNames.map((e) => e.toLowerCase()).includes(s.collegeName.toLowerCase()))
    );
    setConfirmConfig({
      isOpen: true,
      title: "Permanently Clear All Outside Institutions",
      message: `Are you sure you want to permanently delete ALL ${externalColleges.length} outside institutions along with their ${studentsToDelete.length} student profile(s)?`,
      onConfirm: async () => {
        try {
          setIsGlobalDeleting(true);
          allExternalNames.forEach((extName) => {
            markCollegeAsDeleted(extName);
            optimisticDeleteCollege(extName);
          });
          setSelectedExternalIds([]);

          await Promise.all(studentsToDelete.map((s) => deleteStudentProfile(s.id)));
          await refreshCache(); // Immediate UI update
          
          setIsGlobalDeleting(false);
          
          setTimeout(() => {
            toast.success("All outside institutions deleted.");
          }, 100);
        } catch (err) {
          setIsGlobalDeleting(false);
          console.error("Failed to delete all outside institutions:", err);
          toast.error("Failed to delete all outside institutions.");
        }
      }
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimName = name.trim();
    if (!trimName) return;

    // Duplicate Validation
    const existsInOfficial = colleges.some(c => c.name.toLowerCase() === trimName.toLowerCase());
    const existsInExternal = externalColleges.some(c => c.name.toLowerCase() === trimName.toLowerCase());
    
    if (existsInOfficial || existsInExternal) {
      toast.error(`An institution named "${trimName}" already exists.`);
      return;
    }

    setCreating(true);
    try {
      const normalizedEmail = adminEmail.trim().toLowerCase();
      
      // PRE-FLIGHT CHECK
      if (normalizedEmail) {
                const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const emailCheckResp = await fetch("/api/admin/check-email-exists", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ email: normalizedEmail }),
          });
          const emailCheckData = await emailCheckResp.json();
          if (emailCheckData.exists) {
            toast.error("This email is already registered to an existing account/college.");
            setCreating(false);
            return;
          }
        }
      }

      const deptsList: string[] = [];
      selectedDepts.forEach((d) => {
        if (d === "Custom Department") {
          if (customDeptName.trim()) {
            customDeptName.split(",").forEach((c) => {
              const trimmed = c.trim();
              if (trimmed && !deptsList.includes(trimmed)) deptsList.push(trimmed);
            });
          }
        } else if (d !== "General" && !deptsList.includes(d)) {
          deptsList.push(d);
        }
      });
      const depts = ensureGeneralDepartment(deptsList);

      const generatedCode =
        name
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .substring(0, 6) || "COL";

      const collegeId = await createCollege({
        name,
        code: generatedCode,
        departments: depts,
        studentCount: 0,
        adminEmail: normalizedEmail,
        initialPassword: initialPassword,
        loginEnabled: loginEnabled,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          companyName: name,
          companySubtitle: "College Portal",
          logoBase64: "",
        },
      });

      // Attempt to create Auth User if loginEnabled
      if (loginEnabled && normalizedEmail) {
                const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const authResp = await fetch("/api/admin/create-college-auth", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              email: normalizedEmail,
              password: initialPassword,
              collegeId: collegeId,
              collegeName: name,
            }),
          });
          
          if (!authResp.ok) {
            // ROLLBACK College Document
            await deleteCollege(collegeId);
            
            let data: any = {};
            try {
              data = await authResp.json();
            } catch {
              data = { message: "Failed to create college auth account." };
            }
            toast.error(data.message || "Failed to create college auth account. College creation was rolled back.");
            setCreating(false);
            return;
          }
        }
      }

      toast.success(`College "${name}" created successfully.`);
      await refreshCache(); // Immediate UI update
      setShowAddModal(false);
      setName("");
      setSelectedDepts(["Computer Science & Engineering (CSE)", "General"]);
      setCustomDeptName("");
      setAdminEmail("");
      setInitialPassword("");
      setLoginEnabled(false);
    } catch (err) {
      console.error("Failed to create college", err);
    } finally {
      setCreating(false);
    }
  };

  const handleRenameCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingCollege || !renameCollegeName.trim()) return;
    setRenamingLoading(true);
    try {
      const normalizedNewName = renameCollegeName.trim().toLowerCase();
      const oldName = renamingCollege.name;

      if (normalizedNewName !== oldName.toLowerCase()) {
        await renameCollegeAndMigrate(
          renamingCollege.id,
          oldName,
          normalizedNewName,
          false
        );
      }
      await refreshCache();
      toast.success(`College renamed to "${renameCollegeName.trim()}" successfully.`);
      setRenamingCollege(null);
      setRenameCollegeName("");
    } catch (err: any) {
      console.error("Failed to rename college", err);
      showError(err);
    } finally {
      setRenamingLoading(false);
    }
  };

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credsCollege) return;
    setCredsLoading(true);
    try {
      const newEmail = credsAdminEmail.trim().toLowerCase();

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        showError({ message: "Session expired. Please sign in again." });
        return;
      }

      const authResp = await fetch("/api/admin/update-college-auth", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          collegeId: credsCollege.id,
          collegeName: credsCollege.name,
          adminEmail: credsLoginEnabled ? newEmail : undefined,
          password: credsPassword.trim() || undefined,
        }),
      });

      if (!authResp.ok) {
        let data: any = {};
        const textResponse = await authResp.text();
        try {
          data = JSON.parse(textResponse);
        } catch {
          data = { message: "Failed to update college auth details." };
        }
        showError(data);
        return;
      }

      await refreshCache();
      toast.success("College admin credentials updated successfully.");
      setCredsCollege(null);
      setCredsAdminEmail("");
      setCredsPassword("");
    } catch (err: any) {
      console.error("Failed to update credentials", err);
      showError(err);
    } finally {
      setCredsLoading(false);
    }
  };

  const handleUpdateExternalCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExternal || !editExternalName.trim()) return;
    setUpdatingExternal(true);
    try {
      const colId = editingExternal.id;
      const oldName = editingExternal.name;
      const newName = editExternalName.trim();
      if (!newName || oldName === newName) {
        setEditingExternal(null);
        setEditExternalName("");
        return;
      }

      await renameCollegeAndMigrate(colId, oldName, newName, true);
      await refreshCache(); // Immediate UI update
      toast.success("Outside institution updated successfully.");

      setEditingExternal(null);
      setEditExternalName("");
      setSelectedExternalIds((prev) => prev.map((id) => (id === oldName || id === colId ? newName : id)));
    } catch (err) {
      console.error("Failed to update outside institution", err);
      toast.error("Failed to update outside institution.");
    } finally {
      setUpdatingExternal(false);
    }
  };

  const handleRegisterExternalCollege = (extName: string, extDepartments: string[]) => {
    setConfirmConfig({
      isOpen: true,
      title: "Register as Official College",
      message: `Are you sure you want to register "${extName}" as an official college? This will allow you to assign exams and resources to it.`,
      confirmText: "Register",
      onConfirm: async () => {
        try {
          const slug = extName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
          const lowerName = extName.trim().toLowerCase();
          
          if (!slug) {
            toast.error("Invalid institution name");
            return;
          }

          // 1. Create the official college document
          await upsertCollegeAction({
            id: slug,
            name: lowerName,
            departments: ["General", ...extDepartments],
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // 2. Migrate existing students to explicitly point to this slug
          await renameCollegeAndMigrate(slug, extName, lowerName, true);

          // 3. Refresh cache so UI instantly updates
          await refreshCache();
          toast.success(`Registered "${extName}" as an official college.`);
        } catch (err) {
          console.error("Failed to register outside institution:", err);
          toast.error("Failed to register institution.");
        }
      }
    });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Colleges & Academic Hierarchy"
        description="Manage multi-college structures, departments, academic years, sections, and student batches from a single dashboard."
        actions={
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-brand hover:bg-brand/90 text-brand-foreground font-bold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add College</span>
          </Button>
        }
      />

      {lmsLoading && colleges.length === 0 && externalColleges.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading academic hierarchy...</span>
        </div>
      ) : (
        <>
          {colleges.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No colleges registered"
          description="Create your first college to establish the academic hierarchy: College → Department → Academic Year → Section → Batches."
          actionLabel="Register First College"
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-card/60 border border-border">
            <label className="flex items-center gap-2.5 text-xs font-bold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={colleges.length > 0 && selectedAdminIds.length === colleges.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedAdminIds(colleges.map((c) => c.id));
                  else setSelectedAdminIds([]);
                }}
                className="rounded border-border text-brand focus:ring-brand/50"
              />
              <span>Select All Registered Colleges ({colleges.length})</span>
            </label>

            {selectedAdminIds.length > 0 && (
              <Button
                size="sm"
                onClick={handleDeleteSelectedAdminColleges}
                className="h-8 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedAdminIds.length})</span>
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {colleges.map((col) => {
              const isSelected = selectedAdminIds.includes(col.id);
              return (
                <motion.div
                  key={col.id}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl border ${isSelected ? "border-brand bg-brand/5" : "border-border bg-card/95"} p-6 flex flex-col justify-between space-y-5 shadow-lg relative`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedAdminIds((prev) => [...prev, col.id]);
                            else setSelectedAdminIds((prev) => prev.filter((id) => id !== col.id));
                          }}
                          className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer"
                        />
                        <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                          <Building2 className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {(col.loginEnabled || col.adminEmail) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleCollegeStatus(col)}
                            className={`h-8 px-2.5 text-xs font-semibold rounded-lg ${
                              col.status === "restricted"
                                ? "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20"
                                : "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20"
                            }`}
                            title={col.status === "restricted" ? "Restore Access" : "Restrict Access"}
                          >
                            {col.status === "restricted" ? "Restricted" : "Restrict"}
                          </Button>
                        )}
                        {/* 1. Rename College Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRenamingCollege(col);
                            setRenameCollegeName(col.name);
                          }}
                          className="h-8 w-8 p-0 text-brand hover:text-brand/90 hover:bg-brand/10 rounded-lg cursor-pointer"
                          title="Rename College"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {/* 2. Manage Admin Credentials Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            setCredsCollege(col);
                            setCredsAdminEmail(col.adminEmail || "");
                            setCredsPassword("");
                            const hasAdmin = Boolean(col.adminEmail || col.loginEnabled);
                            setCredsLoginEnabled(hasAdmin);

                            try {
                              const userDocs = await getCollegeAdminsAction(col.id);
                              if (userDocs && userDocs.length > 0) {
                                const activeUser = userDocs[0];
                                if (activeUser.email) setCredsAdminEmail(activeUser.email);
                                setCredsLoginEnabled(true);
                              }
                            } catch {}
                          }}
                          className="h-8 w-8 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg cursor-pointer"
                          title="Manage Admin Credentials"
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAdminCollege(col)}
                          disabled={deletingIds.includes(col.id)}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg cursor-pointer disabled:opacity-50"
                          title="Delete College"
                        >
                          {deletingIds.includes(col.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-foreground break-words leading-tight">{col.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="w-4 h-4 text-brand" />
                      <span>{col.studentCount || 0} Students Enrolled</span>
                    </div>
                  </div>

                  {/* Hierarchy tree */}
                  <div className="p-3.5 rounded-xl bg-background/60 border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                      <span className="flex items-center gap-1.5">
                        <FolderTree className="w-3.5 h-3.5 text-brand" />
                        <span>Departments ({col.departments?.length || 0})</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {col.departments?.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-accent/80 text-[11px] text-foreground font-medium">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEnrollForCollege(col)}
                        className="px-2.5 py-1 rounded-lg bg-brand/10 hover:bg-brand/20 text-brand font-bold text-[11px] flex items-center gap-1 transition-all"
                      >
                        <Plus className="w-3 h-3" /> Enroll
                      </button>
                    </div>
                    <Link
                      href={`/colleges/${col.id}`}
                      className="text-brand font-semibold flex items-center gap-0.5 hover:underline cursor-pointer text-[11px]"
                    >
                      Manage Students <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* External / Self-Registered Institutions Section */}
      {externalColleges.length > 0 && (
        <div className="space-y-4 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Self-Registered / Outside Institutions</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Colleges specified by external students during self-registration. Kept separate so admin/trainers can distinguish from official registered hierarchy.
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 self-start sm:self-auto">
              {externalColleges.length} Outside Institution{externalColleges.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <label className="flex items-center gap-2.5 text-xs font-bold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={externalColleges.length > 0 && selectedExternalIds.length === externalColleges.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedExternalIds(externalColleges.map((c) => c.name));
                  else setSelectedExternalIds([]);
                }}
                className="rounded border-border text-amber-500 focus:ring-amber-500/50"
              />
              <span>Select All Outside Institutions ({externalColleges.length})</span>
            </label>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedExternalIds.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleDeleteSelectedExternalColleges}
                  className="h-8 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedExternalIds.length})</span>
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={handleDeleteAllExternalColleges}
                className="h-8 px-3 border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-bold text-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete All {externalColleges.length} Outside Institutions</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {externalColleges.map((col) => {
              const isSelected = selectedExternalIds.includes(col.name);
              const badgeLabel = "Outside Institution";

              return (
                <motion.div
                  key={col.id}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl border ${isSelected ? "border-amber-500 bg-amber-500/5" : "border-amber-500/30 bg-card/95"} p-6 flex flex-col justify-between space-y-5 shadow-lg relative overflow-hidden`}
                >
                  <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500/10 border-l border-b border-amber-500/20 rounded-bl-xl text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                    {badgeLabel}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedExternalIds((prev) => [...prev, col.name]);
                            else setSelectedExternalIds((prev) => prev.filter((id) => id !== col.name));
                          }}
                          className="rounded border-border text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                        />
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                          <Building2 className="w-5 h-5" />
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingExternal({ id: col.id, name: col.name });
                            setEditExternalName(col.name);
                          }}
                          className="h-8 w-8 p-0 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 rounded-lg"
                          title="Rename Institution"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteExternalCollege(col.name, col.name)}
                          disabled={deletingIds.includes(col.name) || deletingIds.includes(col.id)}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg cursor-pointer disabled:opacity-50"
                          title="Delete Institution"
                        >
                          {deletingIds.includes(col.name) ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-bold text-foreground break-words leading-tight pt-1">{col.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="w-4 h-4 text-amber-500" />
                      <span>{col.studentCount || 0} Students Enrolled</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-background/60 border border-border space-y-2 mt-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                      <span className="flex items-center gap-1.5">
                        <FolderTree className="w-3.5 h-3.5 text-amber-500" />
                        <span>Departments ({col.departments?.length || 0})</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {col.departments?.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-accent/80 text-[11px] text-foreground font-medium">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground mt-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleRegisterExternalCollege(col.name, col.departments || [])}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold text-[11px] flex items-center gap-1 transition-all shadow-sm"
                      >
                        <Plus className="w-3 h-3" /> Register Official
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEnrollForCollege(col)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold text-[11px] flex items-center gap-1 transition-all border border-amber-500/20"
                      >
                        <Plus className="w-3 h-3" /> Enroll
                      </button>
                    </div>
                    <Link
                      href={col.isPromoted ? `/colleges/${col.id}` : `/colleges/${encodeURIComponent(col.name)}`}
                      className="text-amber-500 font-semibold flex items-center gap-0.5 hover:underline cursor-pointer text-[11px]"
                    >
                      Manage Students <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
      </>
      )}

      {/* Add College Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Register New College</h3>
                <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">College Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Stanford Institute of Tech"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Initial Departments (Select all that apply)</label>
                  <div className="max-h-52 overflow-y-auto p-3 rounded-lg border border-border bg-background/50 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PREDEFINED_DEPARTMENTS.map((d) => {
                      const isChecked = selectedDepts.includes(d) || d === "General";
                      const isGeneral = d === "General";
                      return (
                        <label
                          key={d}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-brand/10 border-brand/40 text-foreground font-semibold"
                              : "border-border/60 hover:bg-muted/50 text-muted-foreground"
                          } ${isGeneral ? "opacity-80 cursor-not-allowed bg-muted/40" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isGeneral}
                            onChange={(e) => {
                              if (isGeneral) return;
                              if (e.target.checked) {
                                setSelectedDepts((prev) => [...prev, d]);
                              } else {
                                setSelectedDepts((prev) => prev.filter((item) => item !== d));
                              }
                            }}
                            className="rounded border-border text-brand focus:ring-brand/50 w-4 h-4"
                          />
                          <span className="truncate">{d}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {selectedDepts.includes("Custom Department") && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-semibold text-foreground">Custom Department Name(s)</label>
                    <input
                      type="text"
                      value={customDeptName}
                      onChange={(e) => setCustomDeptName(e.target.value)}
                      required
                      placeholder="e.g. Artificial Intelligence & Data Science, Robotics (comma separated)"
                      className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                    />
                    <p className="text-[10px] text-muted-foreground">You can enter multiple custom departments separated by commas.</p>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Note: The "General" department is automatically included by default for all colleges.
                </p>

                <div className="pt-4 border-t border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">College Admin Access</h4>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Enable a dedicated login portal for this college</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={loginEnabled}
                        onChange={(e) => setLoginEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
                    </label>
                  </div>

                  <AnimatePresence>
                    {loginEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[10px] sm:text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                            Admin Email
                          </label>
                          <input
                            type="email"
                            value={adminEmail}
                            onChange={(e) => setAdminEmail(e.target.value)}
                            required={loginEnabled}
                            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                            placeholder="admin@college.edu"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] sm:text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                            Initial Password
                          </label>
                          <input
                            type="text"
                            value={initialPassword}
                            onChange={(e) => setInitialPassword(e.target.value)}
                            required={loginEnabled}
                            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                            placeholder="e.g. Welcome123"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-brand text-brand-foreground hover:bg-brand/90">
                    {creating ? "Creating..." : "Save College"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 1. Rename College Modal */}
      <AnimatePresence>
        {renamingCollege && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Rename College</h3>
                </div>
                <button
                  onClick={() => {
                    setRenamingCollege(null);
                    setRenameCollegeName("");
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleRenameCollege} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">College Name</label>
                  <input
                    type="text"
                    value={renameCollegeName}
                    onChange={(e) => setRenameCollegeName(e.target.value)}
                    required
                    placeholder="e.g. Stanford Institute of Tech"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Renaming will automatically update all associated student and exam records.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRenamingCollege(null);
                      setRenameCollegeName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={renamingLoading} className="bg-brand text-brand-foreground hover:bg-brand/90">
                    {renamingLoading ? "Saving..." : "Save Name"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Manage Admin Credentials Modal */}
      <AnimatePresence>
        {credsCollege && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Admin Credentials</h3>
                    <p className="text-xs text-muted-foreground">{credsCollege.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCredsCollege(null);
                    setCredsAdminEmail("");
                    setCredsPassword("");
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateCredentials} className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/60 border border-border">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">College Admin Access</h4>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Enable dedicated login portal for this college</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={credsLoginEnabled}
                      onChange={(e) => setCredsLoginEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
                  </label>
                </div>

                <AnimatePresence>
                  {credsLoginEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[10px] sm:text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                          Admin Email
                        </label>
                        <input
                          type="email"
                          value={credsAdminEmail}
                          onChange={(e) => setCredsAdminEmail(e.target.value)}
                          required={credsLoginEnabled}
                          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                          placeholder="admin@college.edu"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] sm:text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                            New Password
                          </label>
                          <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                        </div>
                        <input
                          type="text"
                          value={credsPassword}
                          onChange={(e) => setCredsPassword(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                          placeholder="Leave blank to keep current password"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCredsCollege(null);
                      setCredsAdminEmail("");
                      setCredsPassword("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={credsLoading} className="bg-brand text-brand-foreground hover:bg-brand/90">
                    {credsLoading ? "Saving..." : "Save Credentials"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename External Institution Modal */}
      <AnimatePresence>
        {editingExternal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Rename Outside Institution</h3>
                  <p className="text-xs text-muted-foreground">Updates the college name for all enrolled students.</p>
                </div>
                <button
                  onClick={() => {
                    setEditingExternal(null);
                    setEditExternalName("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateExternalCollege} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Institution Name</label>
                  <input
                    type="text"
                    value={editExternalName}
                    onChange={(e) => setEditExternalName(e.target.value)}
                    required
                    placeholder="e.g. Global Institute"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingExternal(null);
                      setEditExternalName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updatingExternal} className="bg-brand text-brand-foreground hover:bg-brand/90">
                    {updatingExternal ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Success Popup */}
      <AnimatePresence>
        {successPopup && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="max-w-sm w-full bg-card border border-emerald-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Success</h3>
                <p className="text-sm text-muted-foreground mt-1">{successPopup}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* College Card Enroll Modal */}
      <AnimatePresence>
        {showCardEnrollModal && selectedCollegeForAction && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-base font-bold text-foreground">Enroll Student in {selectedCollegeForAction.name}</h3>
                  <p className="text-[11px] text-muted-foreground">Pre-configured to create student in this college</p>
                </div>
                <button onClick={() => setShowCardEnrollModal(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>

              <form onSubmit={handleCreateStudentFromCard} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Student Name</label>
                  <input
                    type="text"
                    value={cardEnrollName}
                    onChange={(e) => setCardEnrollName(e.target.value)}
                    required
                    placeholder="e.g. Ananya Rao"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Email Address</label>
                  <input
                    type="email"
                    value={cardEnrollEmail}
                    onChange={(e) => setCardEnrollEmail(e.target.value)}
                    required
                    placeholder="ananya@college.edu"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Department</label>
                    <select
                      value={cardEnrollDept}
                      onChange={(e) => setCardEnrollDept(e.target.value)}
                      required
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      {((selectedCollegeForAction as College).departments || ["Computer Science & Engineering (CSE)", "General"]).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Academic Year</label>
                    <select
                      value={cardEnrollYear}
                      onChange={(e) => setCardEnrollYear(e.target.value)}
                      className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground font-semibold"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                </div>

                {cardEnrollError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 p-3 rounded-xl text-xs font-medium">
                    {cardEnrollError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setShowCardEnrollModal(false)}>Cancel</Button>
                  <Button type="submit" disabled={cardEnrolling} className="bg-brand text-brand-foreground">
                    {cardEnrolling ? "Enrolling..." : "Enroll Student"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* College Card CSV Import Modal */}
      <AnimatePresence>
        {showCardImportModal && selectedCollegeForAction && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Import CSV for {selectedCollegeForAction.name}</h3>
                    <p className="text-[11px] text-muted-foreground">Rows imported here are automatically assigned to {selectedCollegeForAction.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCardImportModal(false);
                    setCardImportSummary(null);
                  }}
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  ✕
                </button>
              </div>

              {!cardImportSummary && (
                <div className="space-y-4">
                  {cardImporting ? (
                    <div className="p-8 text-center space-y-4 bg-accent/30 rounded-2xl border border-border">
                      <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-foreground">Importing Students...</p>
                        {cardImportProgress && (
                          <p className="text-xs font-semibold text-brand">
                            Processed {cardImportProgress.processed} of {cardImportProgress.total} ({Math.round((cardImportProgress.processed / cardImportProgress.total) * 100)}%)
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={cardCancelling}
                        onClick={() => {
                          setCardCancelling(true);
                          cardCancelImportRef.current = true;
                        }}
                        className="flex items-center gap-1.5 mx-auto bg-destructive/20 hover:bg-destructive text-destructive hover:text-white border border-destructive/30 text-xs font-semibold"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        <span>{cardCancelling ? "Stopping..." : "Stop Import"}</span>
                      </Button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files.length > 0) {
                          handleFileUploadFromCard(Array.from(e.dataTransfer.files));
                        }
                      }}
                      className="border-2 border-dashed border-border hover:border-brand/70 rounded-2xl p-8 text-center space-y-4 transition-colors bg-background/50"
                    >
                      <FileSpreadsheet className="w-10 h-10 text-brand mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Select or Drag & Drop CSV / Data File(s)</p>
                        <p className="text-xs text-muted-foreground">Supported formats: .csv, .txt with student Name & Email columns</p>
                      </div>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-xs font-bold cursor-pointer hover:bg-brand/90 transition-all shadow-sm">
                          <FileSpreadsheet className="w-4 h-4 shrink-0" />
                          <span>Select CSV File(s)</span>
                          <input
                            type="file"
                            accept=".csv,.txt,.json,text/csv,text/plain,application/json,*"
                            multiple
                            onChange={handleFileUploadFromCard}
                            disabled={cardImporting}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {cardImportSummary && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-[11px] text-muted-foreground font-medium">Created</span>
                      <p className="text-xl font-bold text-emerald-500">{cardImportSummary.createdCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="text-[11px] text-muted-foreground font-medium">Duplicates</span>
                      <p className="text-xl font-bold text-amber-500">{cardImportSummary.duplicateCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
                      <span className="text-[11px] text-muted-foreground font-medium">Skipped</span>
                      <p className="text-xl font-bold text-slate-400">{cardImportSummary.skippedCount}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                      <span className="text-[11px] text-muted-foreground font-medium">Failed</span>
                      <p className="text-xl font-bold text-rose-500">{cardImportSummary.failedCount}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <Button
                      type="button"
                      onClick={handleDownloadCardCredentials}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Credentials CSV</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowCardImportModal(false);
                        setCardImportSummary(null);
                      }}
                      className="text-xs"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        onClose={() => setConfirmConfig(null)}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText={confirmConfig?.confirmText || "Confirm"}
        variant={confirmConfig?.variant || "destructive"}
        isAlert={confirmConfig?.isAlert}
      />

      <AnimatePresence>
        {isGlobalDeleting && typeof window !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-6 p-8 rounded-2xl bg-card border border-border shadow-2xl max-w-sm text-center relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-brand/5 animate-pulse" />
              <Loader2 className="w-12 h-12 text-brand animate-spin relative z-10" />
              <div className="relative z-10 space-y-2">
                <h3 className="text-lg font-bold text-foreground">Deleting Partner Institution</h3>
                <p className="text-sm text-muted-foreground">This may take a few moments. Please do not close this window or navigate away.</p>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </motion.div>
  );
}
