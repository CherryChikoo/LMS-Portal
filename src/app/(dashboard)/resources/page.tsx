"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FolderOpen, Upload, Link as LinkIcon, FileText, FileSpreadsheet, Video, Image as ImageIcon, Download, Eye, ExternalLink, Trash2, Search, CheckCircle2, Target, Loader2, File } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllResources, createResource, deleteResource, filterResourcesForStudent } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { ResourcePreviewModal, isPreviewable } from "@/components/resources/resource-preview-modal";
import type { Resource, ResourceType, AssignmentTarget, Student } from "@/types";

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("admin");
  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string; profile: Record<string, unknown> } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [resType, setResType] = useState<ResourceType>("pdf");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("Lectures");
  const [creating, setCreating] = useState(false);
  const [resourceSearch, setResourceSearch] = useState("");

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
    getInstitutionName,
  } = useAcademicHierarchy({
    levels: ["institution", "department", "academicYear", "section", "batch"],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const resData = await getAllResources();
      setResources(resData);
    } catch (err) {
      console.error("Failed to fetch resources", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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
    if (!title || !url) return;
    setCreating(true);
    try {
      const target = buildAssignmentTarget();
      // Map the new hierarchy target shape (with `level`) onto the existing
      // composite AssignmentTarget consumed by createResource and the
      // assignment-engine's matchesCompositeTarget evaluator.
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
        type: resType,
        url,
        category,
        tags: [resType.toUpperCase(), category],
        sharedWith: ["all"],
        targets: [compositeTarget],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setShowUploadModal(false);
      setTitle("");
      setUrl("");
      setDesc("");
      resetResourceFilters();
      fetchData();
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
          fetchData();
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
              <Button onClick={() => setShowUploadModal(true)} className="bg-brand hover:bg-brand/90 text-white flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>Upload Resource</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Search & Filter Bar for Resources */}
      {!loading && resources.length > 0 && (
        <div className="flex flex-col gap-3 bg-card/40 backdrop-blur-md p-4 rounded-2xl border border-border">
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
            .map((res) => (
            <motion.div
              key={res.id}
              whileHover={{ y: -4 }}
              className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-5 flex flex-col justify-between space-y-4 shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="w-11 h-11 rounded-xl bg-background border border-border flex items-center justify-center">
                    {getIconForType(res.type)}
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-accent text-[11px] font-bold uppercase tracking-wider text-foreground">
                    {res.category}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-base text-foreground line-clamp-2 break-words leading-tight">{res.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{res.description || "No description provided."}</p>
                </div>
              </div>

              {/* Target badge */}
              {userRole !== "student" && (
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 flex flex-col sm:flex-row sm:items-center gap-1.5 text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                    <Target className="w-3.5 h-3.5 text-brand" />
                    <span>Target:</span>
                  </span>
                  <span className="font-semibold text-foreground uppercase text-[11px] break-words leading-relaxed">
                    {(() => {
                      const t = res.targets?.[0];
                      if (!t) return "All Students";
                      if (t.type === "composite") {
                        const parts = [
                          t.collegeId && t.collegeId !== "ALL" ? getInstitutionName(t.collegeId) : null,
                          t.department && t.department !== "ALL" ? t.department : null,
                          t.academicYear && t.academicYear !== "ALL" ? t.academicYear : null,
                          t.section && t.section !== "ALL" ? `Sec ${t.section}` : null,
                          t.batchId && t.batchId !== "ALL" ? (t.batchName || t.batchId) : null,
                        ].filter(Boolean);
                        return parts.length > 0 ? parts.join(" → ") : "All Students";
                      }
                      return `${t.type} • ${t.ids?.[0] || "Public"}`;
                    })()}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-border flex items-center justify-between">
                {isPreviewable(res) ? (
                  <button
                    onClick={() => setPreviewResource(res)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                ) : (
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </a>
                )}

                <div className="flex items-center gap-2">
                  <a
                    href={res.url}
                    download
                    className="p-2 rounded-lg bg-accent hover:bg-accent/80 text-foreground transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  {userRole !== "student" && (
                    <button
                      onClick={() => handleDelete(res.id)}
                      className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
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
              className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Distribute Learning Resource</h3>
                <button onClick={() => setShowUploadModal(false)} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Resource Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Data Structures Complete Lecture Notes"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Format Type</label>
                    <select
                      value={resType}
                      onChange={(e) => setResType(e.target.value as ResourceType)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                    >
                      <option value="pdf">PDF Document (.pdf)</option>
                      <option value="ppt">Presentation (.ppt/.pptx)</option>
                      <option value="doc">Word Document (.doc/.docx)</option>
                      <option value="video">Video Recording (.mp4)</option>
                      <option value="image">Diagram / Image (.jpg/.png)</option>
                      <option value="zip">Archive Package (.zip)</option>
                      <option value="link">External URL Link</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Category</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Lectures / Lab / Syllabus"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-foreground">File URL / Download Link</label>
                    <label className={`cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${isUploadingFile ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-brand/15 text-brand hover:bg-brand/25 border border-brand/20 transition-colors"}`}>
                      {isUploadingFile ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Local File</span>
                          <input
                            type="file"
                            className="hidden"
                            disabled={isUploadingFile}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setIsUploadingFile(true);
                                try {
                                  // Auto-detect format type
                                  const ext = file.name.split('.').pop()?.toLowerCase();
                                  if (ext === 'pdf') setResType('pdf');
                                  else if (['ppt', 'pptx'].includes(ext!)) setResType('ppt');
                                  else if (['doc', 'docx'].includes(ext!)) setResType('doc');
                                  else if (['mp4', 'webm', 'ogg'].includes(ext!)) setResType('video');
                                  else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext!)) setResType('image');
                                  else if (['zip', 'rar', 'tar', 'gz'].includes(ext!)) setResType('zip');
                                  else setResType('other');
                                  
                                  // Check for empty or unreadable system file
                                  if (file.size === 0) {
                                    setConfirmConfig({
                                      isOpen: true,
                                      isAlert: true,
                                      title: "Upload Failed",
                                      message: "The selected file is empty or cannot be read from your system. Please select a valid file.",
                                      variant: "warning"
                                    });
                                    setIsUploadingFile(false);
                                    e.target.value = "";
                                    return;
                                  }

                                  // Convert to Base64 for Firestore
                                  if (file.size > 750 * 1024) {
                                    setConfirmConfig({
                                      isOpen: true,
                                      isAlert: true,
                                      title: "File Size Limit Exceeded",
                                      message: "Please select a file smaller than 750KB for local Firestore demo storage.",
                                      variant: "warning"
                                    });
                                    setIsUploadingFile(false);
                                    e.target.value = "";
                                    return;
                                  }

                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    if (!reader.result || typeof reader.result !== 'string' || !reader.result.startsWith('data:')) {
                                      setConfirmConfig({
                                        isOpen: true,
                                        isAlert: true,
                                        title: "Upload Failed",
                                        message: "Failed to read file data from your system. The file may be restricted or corrupted.",
                                        variant: "warning"
                                      });
                                      setIsUploadingFile(false);
                                      e.target.value = "";
                                      return;
                                    }

                                    const base64String = reader.result as string;
                                    setUrl(base64String);
                                    
                                    // Default title to file name if empty
                                    if (!title) {
                                      setTitle(file.name.replace(/\.[^/.]+$/, ""));
                                    }
                                    setIsUploadingFile(false);
                                    e.target.value = "";
                                  };
                                  reader.onerror = () => {
                                    setConfirmConfig({
                                      isOpen: true,
                                      isAlert: true,
                                      title: "File Read Error",
                                      message: "Failed to read selected file from your system. Please check file permissions or try another file.",
                                      variant: "warning"
                                    });
                                    setIsUploadingFile(false);
                                    e.target.value = "";
                                  };
                                  reader.onabort = () => {
                                    setConfirmConfig({
                                      isOpen: true,
                                      isAlert: true,
                                      title: "Upload Aborted",
                                      message: "File upload was cancelled or aborted by the system.",
                                      variant: "warning"
                                    });
                                    setIsUploadingFile(false);
                                    e.target.value = "";
                                  };
                                  reader.readAsDataURL(file);
                                } catch (error) {
                                  console.error("Failed to upload file:", error);
                                  setConfirmConfig({
                                    isOpen: true,
                                    isAlert: true,
                                    title: "Upload Failed",
                                    message: "An unexpected system error occurred while uploading. Please try again.",
                                    variant: "warning"
                                  });
                                  setIsUploadingFile(false);
                                  e.target.value = "";
                                }
                              }
                            }}
                          />
                        </>
                      )}
                    </label>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      disabled={isUploadingFile}
                      placeholder="https://drive.google.com/... or click Upload Local File"
                      className="w-full h-10 pl-3 pr-24 rounded-xl border border-border bg-background text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                    />
                    {url && url.startsWith("data:") && (
                      <span className="absolute right-2.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1">
                        ✓ Uploaded
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Tip: Paste an external link OR click &apos;Upload Local File&apos; to select and attach a document directly.</p>
                </div>

                {/* Multi-Factor Targeting Section */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Target className="w-4 h-4 text-brand" />
                    <span>Resource Target</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Select filters to target specific students. Leave as &ldquo;All&rdquo; to share with everyone in that category.</p>

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
                  <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                    <span className="text-muted-foreground">Targeting:</span>
                    <span className="font-bold text-foreground">
                      {(() => {
                        const t = buildAssignmentTarget();
                        const parts = [
                          t.collegeId ? getInstitutionName(t.collegeId) : null,
                          t.department || null,
                          t.academicYear || null,
                          t.section ? `Sec ${t.section}` : null,
                          t.batchName || t.batchId || null,
                        ].filter(Boolean);
                        return parts.length > 0 ? parts.join(" → ") : "All Students (Global)";
                      })()}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowUploadModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-brand text-white hover:bg-brand/90">
                    {creating ? "Publishing..." : "Publish & Share"}
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
