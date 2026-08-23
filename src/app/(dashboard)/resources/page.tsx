"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { 
  FolderOpen, 
  Upload, 
  Link as LinkIcon, 
  FileText, 
  FileSpreadsheet, 
  Video, 
  Image as ImageIcon, 
  ExternalLink, 
  Trash2, 
  Search, 
  CheckCircle2, 
  Target, 
  Loader2, 
  CalendarDays, 
  User, 
  Plus, 
  X, 
  Globe,
  Building2,
  Users,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckSquare,
} from "lucide-react";
import { useSessionStorage } from "@/hooks/use-session-storage";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { AcademicHierarchyFilters } from "@/components/shared/academic-hierarchy-filters";
import { useAcademicHierarchy } from "@/lib/hierarchy/use-academic-hierarchy";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fadeInUp } from "@/lib/animations";
import { createResource, deleteResource, filterResourcesForStudent } from "@/lib/services";
import { getCurrentUser } from "@/lib/utils/auth-session";
import { formatTimestamp, toMillis } from "@/lib/utils/date";
import { useLMSData } from "@/lib/data/use-lms-data";
import { refreshCache } from "@/lib/data/lms-store";
import { ResourcePreviewModal } from "@/components/resources/resource-preview-modal";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import type { Resource, ResourceType, AssignmentTarget, Student } from "@/types";

export default function ResourcesPage() {
  const { filteredResources: resources, students, loading, isSyncing } = useLMSData();
  const [userRole, setUserRole] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("lms_role") || "student").toLowerCase();
    }
    return "student";
  });
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string; profile: Record<string, unknown> } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; variant?: "destructive" | "warning" | "info" | "success" } | null>(null);

  // Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [resourceSearch, setResourceSearch] = useSessionStorage("resources_page_search", "");
  const [currentPage, setCurrentPage] = useSessionStorage("resources_page_currentPage", 1);
  const ITEMS_PER_PAGE = 9;
  const { resolveInstitution } = useEntityResolution();

  // Page filter hierarchy
  const pageHierarchy = useAcademicHierarchy({
    levels: userRole === "college_admin" ? ["department", "academicYear", "section", "batch"] : ["institution", "department", "academicYear", "section", "batch"],
    storageKey: "resources_page_filters",
  });

  // Modal target selector hierarchy (independent state so it doesn't clash with page filter)
  const modalHierarchy = useAcademicHierarchy({
    levels: userRole === "college_admin" ? ["department", "academicYear", "section", "batch"] : ["institution", "department", "academicYear", "section", "batch"],
  });

  useEffect(() => {
    try {
      const storedRole = localStorage.getItem("lms_role");
      if (storedRole) setUserRole(storedRole.toLowerCase());
    } catch (_) {}
    getCurrentUser().then((u) => {
      if (u) setCurrentUser(u);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLinks = links.map(l => l.trim()).filter(l => l.length > 0);
    
    if (!title.trim()) {
      setConfirmConfig({ isOpen: true, title: "Validation Error", message: "Please provide a Resource Name", isAlert: true, variant: "destructive" });
      return;
    }
    if (validLinks.length === 0) {
      setConfirmConfig({ isOpen: true, title: "Validation Error", message: "Please provide at least one valid link", isAlert: true, variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const target = modalHierarchy.buildAssignmentTarget();
      const rawCollegeId = target.collegeId || modalHierarchy.filters.collegeId;
      const cleanCollegeId = (!rawCollegeId || rawCollegeId === "GLOBAL" || rawCollegeId === "ALL" || rawCollegeId === "all" || rawCollegeId === "global" || rawCollegeId === "UNASSIGNED")
        ? null
        : rawCollegeId;

      const compositeTarget: AssignmentTarget = {
        type: "composite",
        ids: ["composite"],
        collegeId: cleanCollegeId || undefined,
        collegeName: target.collegeName || (cleanCollegeId ? resolveInstitution(cleanCollegeId) : undefined),
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
        collegeId: cleanCollegeId || undefined,
        collegeName: target.collegeName || (cleanCollegeId ? resolveInstitution(cleanCollegeId) : undefined),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      setShowUploadModal(false);
      setTitle("");
      setLinks([""]);
      setDesc("");
      modalHierarchy.reset();
      setCreating(false);
      toast.success("Resource uploaded successfully.");
      refreshCache().catch(() => {});
    } catch (err) {
      console.error("Failed to create resource", err);
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
          setDeletingId(id);
          await deleteResource(id);
          await refreshCache();
        } catch (err) {
          console.error("Failed to delete", err);
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const handleBulkDelete = () => {
    if (selectedResources.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: "Bulk Delete Resources",
      message: `Are you sure you want to permanently delete ${selectedResources.length} resources? This action cannot be undone.`,
      variant: "destructive",
      onConfirm: async () => {
        try {
          setIsBulkDeleting(true);
          await Promise.all(selectedResources.map(id => deleteResource(id)));
          await refreshCache();
          setSelectedResources([]);
          toast.success(`${selectedResources.length} resources deleted successfully`);
        } catch (err) {
          console.error("Failed to bulk delete", err);
          toast.error("Failed to delete some resources");
        } finally {
          setIsBulkDeleting(false);
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
      default: return <LinkIcon className="w-5 h-5 text-brand" />;
    }
  };

  const displayResources = useMemo(() => {
    if (userRole !== "student") {
      return (resources as Resource[]).filter((res: Resource) => {
        const t = res.targets?.[0];
        const resColId = res.collegeId || t?.collegeId;

        if (pageHierarchy.filters.collegeId && pageHierarchy.filters.collegeId !== "ALL") {
          if (resColId && resColId !== pageHierarchy.filters.collegeId && resColId !== "GLOBAL" && resColId !== "ALL") {
            return false;
          }
        }

        if (pageHierarchy.filters.department && pageHierarchy.filters.department !== "ALL") {
          if (t?.department && t.department !== "ALL" && t.department !== pageHierarchy.filters.department) {
            return false;
          }
        }

        if (pageHierarchy.filters.academicYear && pageHierarchy.filters.academicYear !== "ALL") {
          if (t?.academicYear && t.academicYear !== "ALL" && t.academicYear !== pageHierarchy.filters.academicYear) {
            return false;
          }
        }

        if (pageHierarchy.filters.section && pageHierarchy.filters.section !== "ALL") {
          if (t?.section && t.section !== "ALL" && t.section !== pageHierarchy.filters.section) {
            return false;
          }
        }

        if (pageHierarchy.filters.batchId && pageHierarchy.filters.batchId !== "ALL") {
          const filterBatch = pageHierarchy.filters.batchId.toLowerCase();
          const tBatchId = t?.batchId?.toLowerCase();
          const tBatchName = t?.batchName?.toLowerCase();
          if (!tBatchId && !tBatchName) return false;
          if (tBatchId !== filterBatch && tBatchName !== filterBatch) return false;
        }

        return true;
      }).sort((a, b) => {
        const hasFilters = pageHierarchy.filters.collegeId && pageHierarchy.filters.collegeId !== "ALL" && pageHierarchy.filters.collegeId !== "GLOBAL";
        
        if (hasFilters) {
          const aT = a.targets?.[0];
          const bT = b.targets?.[0];
          const aTargetCol = a.collegeId || aT?.collegeId;
          const bTargetCol = b.collegeId || bT?.collegeId;
          const aGlobal = !aTargetCol || String(aTargetCol).toLowerCase() === "global" || String(aTargetCol).toLowerCase() === "all";
          const bGlobal = !bTargetCol || String(bTargetCol).toLowerCase() === "global" || String(bTargetCol).toLowerCase() === "all";
          
          if (!aGlobal && bGlobal) return -1;
          if (aGlobal && !bGlobal) return 1;
        }
        
        return (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0);
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
      createdAt: undefined as any,
      updatedAt: new Date(),
    };
    let studentProfile = baseProfile;
    try {
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        const parsed = JSON.parse(uStr);
        const sId = parsed.id || parsed.uid;
        const sEmail = parsed.email;
        const canonical = students.find((s: Student) => s.id === sId || (sEmail && s.email === sEmail));
        
        studentProfile = {
          ...baseProfile,
          ...(parsed || {}),
          ...(canonical || {}),
          collegeId: canonical?.collegeId || parsed?.collegeId || parsed?.college || "",
          collegeName: canonical?.collegeName || parsed?.collegeName || parsed?.college || canonical?.collegeId || parsed?.collegeId || "",
          createdAt: canonical?.createdAt || parsed?.createdAt,
        };
      }
    } catch (_) {}
    return filterResourcesForStudent(resources, studentProfile as Student).sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));
  }, [
    resources,
    students,
    userRole,
    currentUser,
    pageHierarchy.filters.collegeId,
    pageHierarchy.filters.department,
    pageHierarchy.filters.academicYear,
    pageHierarchy.filters.section,
    pageHierarchy.filters.batchId,
  ]);

  if (!mounted) return null;

  const searchedResources = (displayResources as Resource[]).filter((res: Resource) => {
    const q = resourceSearch.toLowerCase().trim();
    return !q || res.title.toLowerCase().includes(q) || (res.category || "").toLowerCase().includes(q) || (res.description || "").toLowerCase().includes(q);
  });

  const totalPages = Math.ceil(searchedResources.length / ITEMS_PER_PAGE);
  const paginatedResources = searchedResources.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title={userRole === "student" ? "Department Study Notes & Resources" : "Learning Resources Hub"}
        description={userRole === "student" ? "Access course notes, reference materials, presentations, and lecture notes targeted for your department." : "Distribute PDFs, presentations, videos, and external materials with granular academic hierarchy targeting."}
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            {userRole !== "student" && (
              <Button onClick={() => setShowUploadModal(true)} className="bg-brand hover:bg-brand/90 text-brand-foreground font-bold flex items-center justify-center gap-2 w-full sm:w-auto">
                <Upload className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Upload Resource</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Bulk Action Bar */}
      {selectedResources.length > 0 && userRole !== "student" && (
        <div className="flex items-center justify-between bg-card border border-border p-3 px-5 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10 text-brand">
              <CheckSquare className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              {selectedResources.length} {selectedResources.length === 1 ? "resource" : "resources"} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedResources([])}
              className="text-muted-foreground border-border"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="flex items-center gap-2"
            >
              {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Search & Filter Bar for Resources */}
      {!loading && resources.length > 0 && (
        <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border" suppressHydrationWarning>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={resourceSearch}
                onChange={(e) => {
                  setResourceSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search resources by title or category..."
                className="w-full h-10 pl-10 pr-10 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
              {resourceSearch && (
                <button 
                  onClick={() => {
                    setResourceSearch("");
                    setCurrentPage(1);
                  }} 
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            {userRole !== "student" && (
              <button
                type="button"
                onClick={() => {
                  pageHierarchy.setFilters({
                    institution: "",
                    collegeId: "",
                    department: "",
                    academicYear: "",
                    section: "",
                    batchId: "",
                  });
                  setCurrentPage(1);
                  setResourceSearch("");
                }}
                className="flex items-center justify-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all whitespace-nowrap shrink-0 border border-transparent hover:border-border"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Filters
              </button>
            )}
          </div>
          {userRole !== "student" && (
            <AcademicHierarchyFilters
              showInstitution={userRole !== "college_admin"}
              levels={userRole === "college_admin" ? ["department", "academicYear", "section", "batch"] : ["institution", "department", "academicYear", "section", "batch"]}
              filters={pageHierarchy.filters}
              onChange={pageHierarchy.setFilters}
              institutionOptions={pageHierarchy.institutionOptions}
              collegeOptions={pageHierarchy.collegeOptions}
              departmentOptions={pageHierarchy.departmentOptions}
              academicYearOptions={pageHierarchy.academicYearOptions}
              sectionOptions={pageHierarchy.sectionOptions}
              batchOptions={pageHierarchy.batchOptions}
              studentOptions={[]}
            />
          )}
        </div>
      )}

      {(loading || (isSyncing && displayResources.length === 0)) ? (
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedResources.length === 0 && resourceSearch ? (
              <div className="col-span-full py-12 text-center space-y-3">
                <p className="text-muted-foreground">No resources match your search.</p>
              </div>
            ) : (
              paginatedResources.map((res: Resource) => {
                const parsedLinks: string[] = res.type === "link" && res.url ? res.url.split(",").filter(Boolean) : [res.url].filter(Boolean);
              
              const t = res.targets?.[0];
              const targetCollege = res.collegeId || t?.collegeId;
              const isExplicitGlobal = !targetCollege || targetCollege === "global" || targetCollege === "GLOBAL" || targetCollege === "all" || targetCollege === "ALL";
              
              const hasSpecificCollege = Boolean(targetCollege && !isExplicitGlobal);
              const hasSpecificDept = Boolean(t?.department && t.department !== "ALL" && t.department !== "all");
              const hasSpecificYear = Boolean(t?.academicYear && t.academicYear !== "ALL" && t.academicYear !== "all");
              const hasSpecificSection = Boolean(t?.section && t.section !== "ALL" && t.section !== "all");
              const hasSpecificBatch = Boolean(t?.batchId && t.batchId !== "ALL" && t.batchId !== "all");
              const hasSpecificStudent = Boolean(t?.studentId);
              
              // Only truly global if NO specific targeting dimension exists
              const isGlobal = !hasSpecificCollege && !hasSpecificDept && !hasSpecificYear && !hasSpecificSection && !hasSpecificBatch && !hasSpecificStudent;

              const collegeLabel = hasSpecificCollege ? resolveInstitution(targetCollege!) : "";
              const canDelete = userRole !== "student" && (userRole !== "college_admin" || !isGlobal);
              const isSelected = selectedResources.includes(res.id);

              return (
                <div
                  key={res.id}
                  className={`relative rounded-3xl border ${isSelected ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-border/60 bg-card'} p-6 sm:p-7 flex flex-col justify-between space-y-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-default`}
                  onClick={(e) => {
                    // Optional: clicking the card selects it, if not clicking a button/link inside
                    if (canDelete) {
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('a')) return;
                      setSelectedResources(prev => isSelected ? prev.filter(id => id !== res.id) : [...prev, res.id]);
                    }
                  }}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {canDelete && (
                          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setSelectedResources(prev => checked ? [...prev, res.id] : prev.filter(id => id !== res.id));
                              }}
                              className="w-5 h-5 rounded border-border data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                            />
                          </div>
                        )}
                        <div className="w-12 h-12 shrink-0 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                          {getIconForType(res.type)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="px-3 py-1 rounded-full bg-secondary text-[10px] font-bold uppercase tracking-widest text-foreground shadow-sm">
                          {res.category}
                        </span>
                        {(() => {
                          if (isGlobal && userRole !== "student") {
                            return (
                              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20 shadow-sm">
                                <Globe className="w-3 h-3" />
                                Global
                              </span>
                            );
                          }
                          if (hasSpecificCollege && userRole !== "student") {
                            return (
                              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 text-[10px] font-bold uppercase tracking-widest border border-purple-500/20 shadow-sm truncate max-w-[140px]" title={collegeLabel}>
                                <Building2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">{collegeLabel}</span>
                              </span>
                            );
                          }
                          if (hasSpecificBatch && userRole !== "student") {
                            return (
                              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-bold uppercase tracking-widest border border-amber-500/20 shadow-sm">
                                <Users className="w-3 h-3" />
                                Cohort
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
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
                        {parsedLinks.map((link: string, idx: number) => {
                          let displayLink = link;
                          try {
                            if (link.startsWith("http://") || link.startsWith("https://")) {
                              displayLink = new URL(link).hostname.replace("www.", "");
                            }
                          } catch (e) {}
                          
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
                            if (isGlobal) return "Global Assignment (All Colleges)";
                            const parts: string[] = [];
                            if (hasSpecificCollege) parts.push(collegeLabel || targetCollege!);
                            if (hasSpecificDept) parts.push(t!.department!);
                            if (hasSpecificYear) parts.push(t!.academicYear!);
                            if (hasSpecificSection) parts.push(`Sec ${t!.section}`);
                            if (hasSpecificBatch) {
                              const bName = t?.batchName && t.batchName !== t.batchId ? t.batchName : "Cohort Batch";
                              parts.push(`Cohort: ${bName}`);
                            }
                            if (hasSpecificStudent) parts.push(t?.studentName || "Specific Student");
                            return parts.length > 0 ? parts.join(" → ") : "All Students";
                          })()}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(res.id);
                          }}
                          disabled={deletingId === res.id}
                          className="px-4 py-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingId === res.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          {deletingId === res.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border/40">
              <div className="text-sm text-muted-foreground">
                Showing <span className="font-bold text-foreground">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-foreground">{Math.min(currentPage * ITEMS_PER_PAGE, searchedResources.length)}</span> of <span className="font-bold text-foreground">{searchedResources.length}</span> Resources
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-9 px-3 border-border hover:bg-card hover:text-foreground"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  <div className="h-9 px-4 flex items-center justify-center rounded-lg bg-card border border-border text-sm font-semibold">
                    {currentPage}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-9 px-3 border-border hover:bg-card hover:text-foreground"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Resource Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Distribute Learning Resource</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Share resources and materials with targeted institutions, departments, or cohorts</p>
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
                  <p className="text-xs sm:text-sm text-muted-foreground">Select filters to target specific institutions or cohorts. Leave as &ldquo;All&rdquo; for global distribution.</p>

                  <AcademicHierarchyFilters
                    layout="grid-2"
                    showInstitution={userRole !== "college_admin"}
                    showBatchToggle={true}
                    levels={userRole === "college_admin" ? ["department", "academicYear", "section", "batch"] : ["institution", "department", "academicYear", "section", "batch"]}
                    filters={modalHierarchy.filters}
                    onChange={modalHierarchy.setFilters}
                    institutionOptions={modalHierarchy.institutionOptions}
                    collegeOptions={modalHierarchy.collegeOptions}
                    departmentOptions={modalHierarchy.departmentOptions}
                    academicYearOptions={modalHierarchy.academicYearOptions}
                    sectionOptions={modalHierarchy.sectionOptions}
                    batchOptions={modalHierarchy.batchOptions}
                    studentOptions={[]}
                    onReset={() => {
                      modalHierarchy.setFilters({
                        institution: "",
                        collegeId: "",
                        department: "",
                        academicYear: "",
                        section: "",
                        batchId: "",
                      });
                    }}
                  />

                  {/* Summary Badge */}
                  <div className="flex items-center gap-2 pt-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-brand" />
                    <span className="text-muted-foreground">Targeting:</span>
                    <span className="font-bold text-foreground bg-accent px-2 py-0.5 rounded-md">
                      {modalHierarchy.filters.batchId && modalHierarchy.filters.batchId !== "ALL"
                        ? "Specific Cohort Batch"
                        : modalHierarchy.filters.collegeId && modalHierarchy.filters.collegeId !== "ALL" && modalHierarchy.filters.collegeId !== "GLOBAL"
                        ? "Specific Institution"
                        : "Global Distribution"}
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
            </div>
          </div>
        )}

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
