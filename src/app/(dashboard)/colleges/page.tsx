"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { GraduationCap, Plus, Building2, Layers, Users, FolderTree, ChevronRight, Trash2, Pencil } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllColleges, createCollege, getAllStudents, deleteStudentProfile, updateCollege, updateStudentProfile, renameCollegeAndMigrate, PREDEFINED_DEPARTMENTS, ensureGeneralDepartment } from "@/lib/services";
import { useLMSDataSelector } from "@/lib/data/use-lms-data";
import { getAuth } from "firebase/auth";
import type { College, Student } from "@/types";

export default function CollegesPage() {
  const colleges = useLMSDataSelector((s) => s.filteredColleges);
  const externalColleges = useLMSDataSelector((s) => s.externalInstitutions);
  const allStudents = useLMSDataSelector((s) => s.students);
  const lmsLoading = useLMSDataSelector((s) => s.loading);

  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [selectedExternalIds, setSelectedExternalIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [name, setName] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["Computer Science & Engineering (CSE)", "General"]);
  const [customDeptName, setCustomDeptName] = useState<string>("");
  const [adminEmail, setAdminEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingCollege, setEditingCollege] = useState<College | null>(null);
  const [editCollegeName, setEditCollegeName] = useState("");
  const [editAdminEmail, setEditAdminEmail] = useState("");
  const [editInitialPassword, setEditInitialPassword] = useState("");
  const [editLoginEnabled, setEditLoginEnabled] = useState(false);
  const [updatingCollege, setUpdatingCollege] = useState(false);

  const [editingExternal, setEditingExternal] = useState<{ id: string; name: string } | null>(null);
  const [editExternalName, setEditExternalName] = useState("");
  const [updatingExternal, setUpdatingExternal] = useState(false);
  const [successPopup, setSuccessPopup] = useState("");



  const fetchColleges = async () => {
    // Reactive updates are handled automatically via useLMSDataSelector
  };

  const handleDeleteAdminCollege = (col: College) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Partner Institution",
      message: `Are you sure you want to permanently delete "${col.name}"? This action will also delete all students, departments, and associated data. This cannot be undone.`,
      onConfirm: async () => {
        setLoading(true);
        try {
          const auth = getAuth();
          const token = await auth.currentUser?.getIdToken();
          if (!token) throw new Error("Not authenticated");

          const res = await fetch("/api/admin/delete-college", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: col.id,
              adminIdToken: token,
            }),
          });
          
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to delete college");
          }

          setSelectedAdminIds((prev) => prev.filter((id) => id !== col.id));
          await fetchColleges();
        } catch (err: any) {
          console.error("Failed to delete college:", err);
          alert(err.message || "Failed to delete college");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleToggleCollegeStatus = async (col: College) => {
    setConfirmConfig({
      isOpen: true,
      title: col.status === "restricted" ? "Unrestrict Partner Institution" : "Restrict Partner Institution",
      message: col.status === "restricted" 
        ? `Are you sure you want to restore access to "${col.name}"? Their College Admin will be able to log in again.`
        : `Are you sure you want to restrict "${col.name}"? Their College Admin will immediately lose access to the portal.`,
      onConfirm: async () => {
        setLoading(true);
        try {
          const newStatus = col.status === "restricted" ? "active" : "restricted";
          await updateCollege(col.id, { status: newStatus });
          await fetchColleges();
        } catch (err) {
          console.error("Failed to toggle college status:", err);
        } finally {
          setLoading(false);
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
        setLoading(true);
        try {
          const auth = getAuth();
          const token = await auth.currentUser?.getIdToken();
          if (!token) throw new Error("Not authenticated");

          await Promise.all(selectedAdminIds.map(async (id) => {
            const res = await fetch("/api/admin/delete-college", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, adminIdToken: token }),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || "Failed to delete college");
            }
          }));
          setSelectedAdminIds([]);
          await fetchColleges();
        } catch (err: any) {
          console.error("Failed to delete selected colleges:", err);
          alert(err.message || "Failed to delete selected colleges");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteExternalCollege = (extName: string) => {
    const studentsToDelete = allStudents.filter((s) => s.collegeName === extName || s.collegeId === extName);
    setConfirmConfig({
      isOpen: true,
      title: "Delete Outside Institution",
      message: `Are you sure you want to delete outside institution "${extName}" along with its ${studentsToDelete.length} enrolled student profile(s)?`,
      onConfirm: async () => {
        setLoading(true);
        try {
          await Promise.all(studentsToDelete.map((s) => deleteStudentProfile(s.id)));
          setSelectedExternalIds((prev) => prev.filter((id) => id !== extName));
          await fetchColleges();
          setSuccessPopup(`Outside institution "${extName}" was deleted successfully.`);
        } catch (err) {
          console.error("Failed to delete outside institution:", err);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteSelectedExternalColleges = () => {
    if (selectedExternalIds.length === 0) return;
    const studentsToDelete = allStudents.filter((s) => (s.collegeName && selectedExternalIds.includes(s.collegeName)) || (s.collegeId && selectedExternalIds.includes(s.collegeId)));
    setConfirmConfig({
      isOpen: true,
      title: "Delete Selected Outside Institutions",
      message: `Are you sure you want to delete ${selectedExternalIds.length} selected outside institution(s) along with ${studentsToDelete.length} enrolled student profile(s)?`,
      onConfirm: async () => {
        setLoading(true);
        try {
          await Promise.all(studentsToDelete.map((s) => deleteStudentProfile(s.id)));
          setSelectedExternalIds([]);
          await fetchColleges();
          setSuccessPopup(`${selectedExternalIds.length} outside institution(s) were deleted successfully.`);
        } catch (err) {
          console.error("Failed to delete selected outside institutions:", err);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteAllExternalColleges = () => {
    if (externalColleges.length === 0) return;
    const allExternalNames: string[] = externalColleges.map((c) => c.name);
    const studentsToDelete = allStudents.filter((s) => (s.collegeName && allExternalNames.includes(s.collegeName)) || (s.collegeId && allExternalNames.includes(s.collegeId)));
    setConfirmConfig({
      isOpen: true,
      title: "Permanently Clear All Outside Institutions",
      message: `Are you sure you want to permanently delete ALL ${externalColleges.length} outside institutions along with their ${studentsToDelete.length} student profile(s)?`,
      onConfirm: async () => {
        setLoading(true);
        try {
          await Promise.all(studentsToDelete.map((s) => deleteStudentProfile(s.id)));
          setSelectedExternalIds([]);
          await fetchColleges();
          setSuccessPopup("All outside institutions were deleted successfully.");
        } catch (err) {
          console.error("Failed to delete all outside institutions:", err);
        } finally {
          setLoading(false);
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

      await createCollege({
        name,
        code: generatedCode,
        departments: depts,
        studentCount: 0,
        adminEmail: adminEmail.trim().toLowerCase(),
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
      setShowAddModal(false);
      setName("");
      setSelectedDepts(["Computer Science & Engineering (CSE)", "General"]);
      setCustomDeptName("");
      setAdminEmail("");
      setInitialPassword("");
      setLoginEnabled(false);
      fetchColleges();
    } catch (err) {
      console.error("Failed to create college", err);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollege || !editCollegeName.trim()) return;
    setUpdatingCollege(true);
    try {
      if (editCollegeName.trim() !== editingCollege.name) {
        await renameCollegeAndMigrate(
          editingCollege.id,
          editingCollege.name,
          editCollegeName.trim(),
          false
        );
      }
      
      await updateCollege(editingCollege.id, {
        adminEmail: editAdminEmail.trim().toLowerCase(),
        initialPassword: editInitialPassword,
        loginEnabled: editLoginEnabled,
      });

      setEditingCollege(null);
      setEditCollegeName("");
      setEditAdminEmail("");
      setEditInitialPassword("");
      setEditLoginEnabled(false);
      await fetchColleges();
    } catch (err) {
      console.error("Failed to update college", err);
    } finally {
      setUpdatingCollege(false);
    }
  };

  const handleUpdateExternalCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExternal || !editExternalName.trim()) return;
    setUpdatingExternal(true);
    try {
      const oldName = editingExternal.name;
      const newName = editExternalName.trim();
      if (!newName || oldName === newName) {
        setEditingExternal(null);
        setEditExternalName("");
        return;
      }

      await renameCollegeAndMigrate(oldName, oldName, newName, true);

      setEditingExternal(null);
      setEditExternalName("");
      setSelectedExternalIds((prev) => prev.map((id) => (id === oldName ? newName : id)));
      await fetchColleges();
    } catch (err) {
      console.error("Failed to update outside institution", err);
    } finally {
      setUpdatingExternal(false);
    }
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

      {loading ? (
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
                        {col.loginEnabled && (
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingCollege(col);
                            setEditCollegeName(col.name);
                            setEditAdminEmail(col.adminEmail || "");
                            setEditInitialPassword(col.initialPassword || "");
                            setEditLoginEnabled(col.loginEnabled || false);
                          }}
                          className="h-8 w-8 p-0 text-brand hover:text-brand/90 hover:bg-brand/10 rounded-lg"
                          title="Edit College Name"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAdminCollege(col)}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg"
                          title="Delete College"
                        >
                          <Trash2 className="w-4 h-4" />
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

                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      <span>4 Years • A-D Sections</span>
                    </span>
                    <Link
                      href={`/colleges/${col.id}`}
                      className="text-brand font-semibold flex items-center gap-0.5 hover:underline cursor-pointer"
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
              const badgeLabel = "Deleted / Self-Registered";

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
                          onClick={() => handleDeleteExternalCollege(col.name)}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg"
                          title="Delete Institution"
                        >
                          <Trash2 className="w-4 h-4" />
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

                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground mt-4">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      <span>External Origin</span>
                    </span>
                    <Link
                      href={col.isPromoted ? `/colleges/${col.id}` : `/colleges/${encodeURIComponent(col.name)}`}
                      className="text-amber-500 font-semibold flex items-center gap-0.5 hover:underline cursor-pointer"
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

      {/* Edit College Name Modal */}
      <AnimatePresence>
        {editingCollege && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Edit College Details</h3>
                <button
                  onClick={() => {
                    setEditingCollege(null);
                    setEditCollegeName("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateCollege} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">College Name</label>
                  <input
                    type="text"
                    value={editCollegeName}
                    onChange={(e) => setEditCollegeName(e.target.value)}
                    required
                    placeholder="e.g. Stanford Institute of Tech"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="pt-4 border-t border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">College Admin Access</h4>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Enable a dedicated login portal for this college</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editLoginEnabled}
                        onChange={(e) => setEditLoginEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
                    </label>
                  </div>

                  <AnimatePresence>
                    {editLoginEnabled && (
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
                            value={editAdminEmail}
                            onChange={(e) => setEditAdminEmail(e.target.value)}
                            required={editLoginEnabled}
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
                            value={editInitialPassword}
                            onChange={(e) => setEditInitialPassword(e.target.value)}
                            required={editLoginEnabled}
                            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                            placeholder="e.g. Welcome123"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingCollege(null);
                      setEditCollegeName("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updatingCollege} className="bg-brand text-brand-foreground hover:bg-brand/90">
                    {updatingCollege ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Outside Institution Name Modal */}
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

      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        onClose={() => setConfirmConfig(null)}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Delete"
        variant="destructive"
      />
    </motion.div>
  );
}
