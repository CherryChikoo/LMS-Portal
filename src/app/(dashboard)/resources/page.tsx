"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FolderOpen, Upload, Link as LinkIcon, FileText, FileSpreadsheet, Video, Image as ImageIcon, Download, Eye, ExternalLink, Trash2, Search, CheckCircle2, Target, Loader2, File, CalendarDays, User, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllResources, createResource, deleteResource, filterResourcesForStudent } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { formatTimestamp } from "@/lib/utils/date";
import { useLMSData } from "@/lib/data/use-lms-data";
import { ResourcePreviewModal, isPreviewable } from "@/components/resources/resource-preview-modal";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import type { Resource, ResourceType, AssignmentTarget, Student } from "@/types";

export default function ResourcesPage() {
  const { filteredResources: resources, loading } = useLMSData();
  const [userRole, setUserRole] = useState<string>("admin");
  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string; profile: Record<string, unknown> } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);
  const [resourceSearch, setResourceSearch] = useState("");
  const { resolveInstitution } = useEntityResolution();

  // Single shared cascading hierarchy used by both the page filter bar and the
  // upload/assignment modal. Avoids duplicate subscriptions and ensures the
  // institution dropdown surfaces official, external (self-registered), and
  // Global entries.
  const {
    filters: resourceFilters,
    setFilters: setResourceFilters,
    reset: resetResourceFilters,
    institutionOptions,
    collegeOptions,
    departmentOptions,
    academicYearOptions,
    sectionOptions,
    batchOptions,
    buildAssignmentTarget,
  } = useAcademicHierarchy({
    levels: ["institution", "department", "academicYear", "section", "batch"],
  });

  useEffect(() => {
    try {
      const storedRole = localStorage.getItem("lms_role");
      if (storedRole) setUserRole(storedRole.toLowerCase());
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
    }
    getCurrentUser().then((u) => {
      if (u) setCurrentUser(u);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLinks = links.map(l => l.trim()).filter(l => l.length > 0);
    if (!title || validLinks.length === 0) return;
    setCreating(true);
    try {
      const target = buildAssignmentTarget();
      const compositeTarget: AssignmentTarget = {
        type: "composite",
        ids: ["composite"],
        collegeId: target.collegeId,
        collegeName: target.collegeName,
        department: target.department,
        academicYear: target.academicYear,
        section: target.section,
        batchId: target.batchId,
        batchName: target.batchName,
      };
      await createResource({
        title,
        description: desc,
        type: "link",
        url: validLinks.join(","),
        category: "Shared Resource",
        tags: ["LINK", "Shared Resource"],
        sharedWith: ["all"],
        targets: [compositeTarget],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setShowUploadModal(false);
      setTitle("");
      setLinks([""]);
      setDesc("");
      resetResourceFilters();
    } catch (err) {
      console.error("Failed to create resource", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Learning Resource",
      message: "Are you sure you want to permanently delete this resource file? Students will no longer be able to access it.",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteResource(id);
        } catch (err) {
          console.error("Failed to delete", err);
        }
      }
    });
  };

  const getIconForType = (type: ResourceType) => {
    switch (type) {
      case "pdf": return <FileText className="w-5 h-5 text-red-500" />;
      case "ppt": return <FileSpreadsheet className="w-5 h-5 text-amber-500" />;
      case "doc": return <FileText className="w-5 h-5 text-blue-500" />;
      case "video": return <Video className="w-5 h-5 text-purple-500" />;
      case "image": return <ImageIcon className="w-5 h-5 text-emerald-500" />;
      case "other": return <File className="w-5 h-5 text-gray-500" />;
      default: return <LinkIcon className="w-5 h-5 text-brand" />;
    }
  };

  // Filter if student view using the resolved Firebase uid/email so students
  // only see resources assigned to them by hierarchy or direct targeting.
  // For trainers/admins, also apply the cascading hierarchy filter bar.
  const displayResources = useMemo(() => {
    if (userRole !== "student") {
      return resources.filter((res) => {
        const t = res.targets?.[0];
        if (resourceFilters.collegeId && t?.collegeId !== resourceFilters.collegeId) return false;
        if (resourceFilters.department && t?.department !== resourceFilters.department) return false;
        if (resourceFilters.academicYear && t?.academicYear !== resourceFilters.academicYear) return false;
        if (resourceFilters.section && t?.section !== resourceFilters.section) return false;
        if (resourceFilters.batchId && t?.batchId !== resourceFilters.batchId) return false;
        return true;
      });
    }
    const baseProfile = {
      id: currentUser?.uid || "",
      name: "",
      email: currentUser?.email || "",
      collegeId: "",
      department: "",
      semester: 1,
      section: "",
      rollNumber: "",
      batchIds: [] as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let studentProfile = baseProfile;
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) studentProfile = { ...baseProfile, ...JSON.parse(uStr) };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
    }
    return filterResourcesForStudent(resources, studentProfile as Student);
  }, [
    resources,
    userRole,
    currentUser,
    resourceFilters.collegeId,
    resourceFilters.department,
    resourceFilters.academicYear,
    resourceFilters.section,
    resourceFilters.batchId,
  ]);

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title={userRole === "student" ? "Department Study Notes & Resources" : "Learning Resources Hub"}
        description={userRole === "student" ? "Access course notes, reference materials, presentations, and lecture notes targeted for your department." : "Distribute PDFs, presentations, videos, and external materials with granular academic hierarchy targeting."}
        actions={
          <div className="flex items-center gap-3">
            {userRole !== "student" && (
              <Button onClick={() => setShowUploadModal(true)} className="bg-brand hover:bg-brand/90 text-brand-foreground font-bold flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>Upload Resource</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Search & Filter Bar for Resources */}
      {!loading && resources.length > 0 && (
        <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={resourceSearch}
              onChange={(e) => setResourceSearch(e.target.value)}
              placeholder="Search resources by title or category..."
              className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          {userRole !== "student" && (
            <AcademicHierarchyFilters
              showInstitution
              levels={["institution", "department", "academicYear", "section", "batch"]}
              filters={resourceFilters}
              onChange={setResourceFilters}
              institutionOptions={institutionOptions}
              collegeOptions={collegeOptions}
              departmentOptions={departmentOptions}
              academicYearOptions={academicYearOptions}
              sectionOptions={sectionOptions}
              batchOptions={batchOptions}
              studentOptions={[]}
            />
          )}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading resources...</span>
        </div>
      ) : displayResources.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={userRole !== "student" ? "No resources published yet" : "No study materials assigned to you yet"}
          description={
            userRole !== "student"
              ? "Upload educational files or share external reference links and target them to specific colleges, departments, or batches."
              : "Check back later or discuss doubts with your trainer."
          }
          actionLabel={userRole !== "student" ? "Share Your First Resource" : undefined}
          onAction={userRole !== "student" ? () => setShowUploadModal(true) : () => {}}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayResources
            .filter((res) => {
              const q = resourceSearch.toLowerCase();
              const matchesSearch = !q || res.title.toLowerCase().includes(q) || (res.category || "").toLowerCase().includes(q) || (res.description || "").toLowerCase().includes(q);
              return matchesSearch;
            })
            .map((res) => {
              const parsedLinks = res.type === "link" && res.url ? res.url.split(",").filter(Boolean) : [res.url].filter(Boolean);
              
              return (
                <motion.div
                  key={res.id}
                  whileHover={{ y: -4 }}
                  className="rounded-3xl border border-border/60 bg-card p-6 sm:p-7 flex flex-col justify-between space-y-6 shadow-sm hover:shadow-lg transition-all"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="w-12 h-12 shrink-0 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                        {getIconForType(res.type)}
                      </div>
                      <span className="px-3 py-1 rounded-full bg-secondary text-[10px] font-bold uppercase tracking-widest text-foreground shadow-sm">
                        {res.category}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-lg sm:text-xl text-foreground line-clamp-2 break-words leading-tight tracking-tight">
                        {res.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                        {res.description || "No description provided."}
                      </p>
                    </div>
                  </div>

                  {/* Resource Links Section */}
                  {parsedLinks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Attached Links
                      </div>
                      <div className="flex flex-col gap-2">
                        {parsedLinks.map((link, idx) => {
                          let displayLink = link;
                          try {
                            if (link.startsWith("http://") || link.startsWith("https://")) {
                              displayLink = new URL(link).hostname.replace("www.", "");
                            }
                          } catch (e) {
                            // Keep raw link if parsing fails
                          }
                          
                          return (
                          <a
                            key={idx}
                            href={link.startsWith("http") ? link : `https://${link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted border border-border/50 hover:border-border transition-colors group/link"
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <LinkIcon className="w-4 h-4 shrink-0 text-brand" />
                              <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-[250px]">
                                {displayLink}
                              </span>
                            </div>
                            <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground group-hover/link:text-foreground transition-colors" />
                          </a>
                        )})}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>{formatTimestamp(res.createdAt) || "Unknown Date"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>{res.createdBy || "Admin"}</span>
                      </div>
                    </div>

                    {/* Target badge */}
                    {userRole !== "student" && (
                      <div className="p-3 rounded-xl bg-muted/50 border border-border/60 flex flex-col gap-1.5 text-xs">
                        <span className="flex items-center gap-1.5 font-bold text-brand uppercase tracking-wider text-[10px]">
                          <Target className="w-3.5 h-3.5" />
                          <span>Target Audience</span>
                        </span>
                        <span className="font-medium text-foreground leading-relaxed truncate">
                          {(() => {
                            const t = res.targets?.[0];
                            if (!t) return "All Students";
                            if (t.type === "composite") {
                              const parts = [
                                t.collegeId && t.collegeId !== "ALL" ? resolveInstitution(t.collegeId) : null,
                                t.department && t.department !== "ALL" ? t.department : null,
                                t.academicYear && t.academicYear !== "ALL" ? t.academicYear : null,
                                t.section && t.section !== "ALL" ? `Sec ${t.section}` : null,
                                t.batchId && t.batchId !== "ALL" ? (!t.batchName || t.batchName === t.batchId ? "Unknown Batch" : t.batchName) : null,
                              ].filter(Boolean);
                              return parts.length > 0 ? parts.join(" → ") : "All Students";
                            }
                            // Legacy target shape — resolve IDs to names
                            const resolvedNames = (t.ids || []).map(rawId => {
                              if (rawId === "ALL") return "All Institutions";
                              return resolveInstitution(rawId);
                            });
                            return `${t.type} • ${resolvedNames.join(", ")}`;
                          })()}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      {userRole !== "student" && (
                        <button
                          onClick={() => handleDelete(res.id)}
                          className="px-4 py-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-semibold transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
        </div>
      )}

      {/* Upload Resource Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Distribute Learning Resource</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">Share resources and materials with your students</p>
                </div>
                <button onClick={() => setShowUploadModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Resource Name</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Enter resource name..."
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Resource Description</label>
                  <textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Enter a short description about this resource..."
                    rows={4}
                    className="w-full p-4 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all resize-none"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-foreground">Resource Sharing Links</label>
                    <button 
                      type="button" 
                      onClick={() => setLinks([...links, ""])}
                      className="text-xs font-semibold text-brand hover:text-brand/80 transition-colors flex items-center gap-1 bg-brand/10 px-2 py-1 rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Link
                    </button>
                  </div>
                  
                  <div className="space-y-2.5 p-4 rounded-2xl bg-secondary/30 border border-border/50">
                    {links.map((link, index) => (
                      <div key={index} className="flex items-start gap-2 relative group">
                        <div className="absolute left-3 top-3.5 flex items-center justify-center text-muted-foreground">
                          <LinkIcon className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={link}
                          onChange={(e) => {
                            const newLinks = [...links];
                            newLinks[index] = e.target.value;
                            setLinks(newLinks);
                          }}
                          placeholder="https://drive.google.com/..."
                          className="flex-1 h-11 pl-9 pr-4 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                        />
                        {links.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLinks(links.filter((_, i) => i !== index))}
                            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-all opacity-0 group-hover:opacity-100 sm:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground mt-2 px-1">
                      Paste links to external resources (Google Drive, OneDrive, GitHub, YouTube, etc.)
                    </p>
                  </div>
                </div>

                {/* Multi-Factor Targeting Section */}
                <div className="p-5 rounded-2xl bg-secondary/30 border border-border/80 space-y-4">
                  <div className="flex items-center gap-2 font-bold text-foreground text-sm sm:text-base">
                    <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center">
                      <Target className="w-4 h-4" />
                    </div>
                    <span>Resource Target Audience</span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Select filters to target specific students. Leave as &ldquo;All&rdquo; to share with everyone in that category.</p>

                  <AcademicHierarchyFilters
                    layout="grid-2"
                    showInstitution
                    levels={["institution", "department", "academicYear", "section", "batch"]}
                    filters={resourceFilters}
                    onChange={setResourceFilters}
                    institutionOptions={institutionOptions}
                    collegeOptions={collegeOptions}
                    departmentOptions={departmentOptions}
                    academicYearOptions={academicYearOptions}
                    sectionOptions={sectionOptions}
                    batchOptions={batchOptions}
                    studentOptions={[]}
                  />

                  {/* Summary Badge */}
                  <div className="flex items-center gap-2 pt-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-brand" />
                    <span className="text-muted-foreground">Targeting:</span>
                    <span className="font-bold text-foreground bg-accent px-2 py-0.5 rounded-md">
                      {resourceFilters.batchId && resourceFilters.batchId !== "ALL"
                        ? "Specific Batch"
                        : "Hierarchy Target"}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
                  <Button type="button" variant="ghost" onClick={() => setShowUploadModal(false)} className="rounded-xl px-6">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-brand hover:bg-brand/90 text-brand-foreground font-bold rounded-xl px-8 flex items-center gap-2 shadow-md">
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Distribute Resource</span>
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ResourcePreviewModal
        resource={previewResource}
        isOpen={!!previewResource}
        onClose={() => setPreviewResource(null)}
      />

      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        onClose={() => setConfirmConfig(null)}
        onConfirm={confirmConfig?.onConfirm || (() => {})}
        title={confirmConfig?.title || ""}
        message={confirmConfig?.message || ""}
        confirmText="Delete"
        variant={confirmConfig?.variant || "destructive"}
        isAlert={confirmConfig?.isAlert}
      />
    </motion.div>
  );
}
