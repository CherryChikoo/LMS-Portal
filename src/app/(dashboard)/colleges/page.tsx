"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GraduationCap, Plus, Building2, Layers, Users, FolderTree, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllColleges, createCollege, getAllStudents, deleteCollege, deleteStudentProfile } from "@/lib/services";
import type { College, Student } from "@/types";

export default function CollegesPage() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [externalColleges, setExternalColleges] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [selectedExternalIds, setSelectedExternalIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [name, setName] = useState("");
  const [deptsStr, setDeptsStr] = useState("Computer Science, Information Technology, Electronics, Mechanical");
  const [creating, setCreating] = useState(false);

  const fetchColleges = async () => {
    setLoading(true);
    try {
      const [collegesData, studentsData] = await Promise.all([
        getAllColleges(),
        getAllStudents(),
      ]);

      setAllStudents(studentsData);

      const computedColleges = collegesData.map((col) => ({
        ...col,
        studentCount: studentsData.filter((s) => s.collegeId === col.id || s.collegeName === col.name).length,
      }));

      const officialSet = new Set([
        ...collegesData.map((c) => c.id.toLowerCase()),
        ...collegesData.map((c) => c.name.toLowerCase()),
      ]);

      const externalMap = new Map<string, { name: string; students: any[] }>();
      studentsData.forEach((s) => {
        const cName = s.collegeName || s.collegeId;
        if (!cName) return;
        if (
          !officialSet.has(cName.toLowerCase()) &&
          !officialSet.has((s.collegeId || "").toLowerCase()) &&
          !officialSet.has((s.collegeName || "").toLowerCase())
        ) {
          if (!externalMap.has(cName)) {
            externalMap.set(cName, { name: cName, students: [] });
          }
          externalMap.get(cName)!.students.push(s);
        }
      });

      const computedExternal = Array.from(externalMap.values()).map((ext) => ({
        id: ext.name,
        name: ext.name,
        studentCount: ext.students.length,
        departments: Array.from(new Set(ext.students.map((s) => s.department).filter(Boolean))),
      }));

      setColleges(computedColleges);
      setExternalColleges(computedExternal);
    } catch (err) {
      console.error("Failed to fetch colleges", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, []);

  const handleDeleteAdminCollege = (col: College) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Partner Institution",
      message: `Are you sure you want to permanently delete "${col.name}"? This action cannot be undone.`,
      onConfirm: async () => {
        setLoading(true);
        try {
          await deleteCollege(col.id);
          setSelectedAdminIds((prev) => prev.filter((id) => id !== col.id));
          await fetchColleges();
        } catch (err) {
          console.error("Failed to delete college:", err);
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
          await Promise.all(selectedAdminIds.map((id) => deleteCollege(id)));
          setSelectedAdminIds([]);
          await fetchColleges();
        } catch (err) {
          console.error("Failed to delete selected colleges:", err);
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
    if (!name) return;
    setCreating(true);
    try {
      const depts = deptsStr
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setShowAddModal(false);
      setName("");
      fetchColleges();
    } catch (err) {
      console.error("Failed to create college", err);
    } finally {
      setCreating(false);
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
            className="bg-brand hover:bg-brand/90 text-white flex items-center gap-2"
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
      ) : colleges.length === 0 ? (
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
                  className={`rounded-2xl border ${isSelected ? "border-brand bg-brand/5" : "border-border bg-card/60"} backdrop-blur-md p-6 flex flex-col justify-between space-y-5 shadow-lg relative`}
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
              return (
                <motion.div
                  key={col.id}
                  whileHover={{ y: -4 }}
                  className={`rounded-2xl border ${isSelected ? "border-rose-500 bg-rose-500/5" : "border-amber-500/30 bg-card/60"} backdrop-blur-md p-6 flex flex-col justify-between space-y-5 shadow-lg relative overflow-hidden`}
                >
                  <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500/10 border-l border-b border-amber-500/20 rounded-bl-xl text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                    Self-Registered
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

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteExternalCollege(col.name)}
                        className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg"
                        title="Delete Outside Institution"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <h3 className="text-xl font-bold text-foreground break-words leading-tight">{col.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="w-4 h-4 text-amber-500" />
                      <span>{col.studentCount || 0} Students Enrolled</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-background/60 border border-border space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                      <span className="flex items-center gap-1.5">
                        <FolderTree className="w-3.5 h-3.5 text-amber-500" />
                        <span>Departments ({col.departments?.length || 0})</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {col.departments?.map((d: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-accent/80 text-[11px] text-foreground font-medium">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-semibold text-amber-500/80">
                      <Layers className="w-3.5 h-3.5" />
                      <span>External Origin</span>
                    </span>
                    <Link
                      href={`/colleges/${encodeURIComponent(col.id)}`}
                      className="text-amber-500 font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
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

      {/* Add College Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
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
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Departments (comma separated)</label>
                  <textarea
                    value={deptsStr}
                    onChange={(e) => setDeptsStr(e.target.value)}
                    rows={3}
                    placeholder="Computer Science, Electronics, Mechanical"
                    className="w-full p-3 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-brand text-white hover:bg-brand/90">
                    {creating ? "Creating..." : "Save College"}
                  </Button>
                </div>
              </form>
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
