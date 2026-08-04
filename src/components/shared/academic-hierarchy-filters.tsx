"use client";

import { useId, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FilterDropdown } from "@/components/shared/filter-dropdown";
import type { SelectOption } from "@/types";
import type { AcademicFilters, FilterValidation } from "@/lib/hierarchy/hierarchy-data";
import type { AcademicHierarchyLevel } from "@/lib/hierarchy/use-academic-hierarchy";
import { useEntityResolution } from "@/lib/data/use-entity-resolution";
import { useLMSData } from "@/lib/data/use-lms-data";
import { RotateCcw } from "lucide-react";

export interface LevelConfig {
  level: AcademicHierarchyLevel;
  label?: string;
  allLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}

export type AcademicHierarchyLayout = "horizontal" | "vertical" | "responsive" | "grid-2" | "grid-3";

export interface AcademicHierarchyFiltersProps {
  levels?: AcademicHierarchyLevel[] | LevelConfig[];
  institutionOptions?: SelectOption[];
  collegeOptions: SelectOption[];
  departmentOptions: SelectOption[];
  academicYearOptions: SelectOption[];
  sectionOptions: SelectOption[];
  batchOptions: SelectOption[];
  studentOptions: SelectOption[];
  filters: AcademicFilters;
  filterValidation?: FilterValidation;
  onChange: (filters: Partial<AcademicFilters>) => void;
  onReset?: () => void;
  loading?: boolean;
  className?: string;
  selectClassName?: string;
  labelClassName?: string;
  disabled?: boolean;
  layout?: AcademicHierarchyLayout;
  showInstitution?: boolean;
  showBatchToggle?: boolean;
  appendContent?: React.ReactNode;
}

const DEFAULT_LEVELS: AcademicHierarchyLevel[] = [
  "college",
  "department",
  "academicYear",
  "section",
  "batch",
  "student",
];

const DEFAULT_LABELS: Record<AcademicHierarchyLevel, string> = {
  institution: "Institution",
  college: "College",
  department: "Department",
  academicYear: "Academic Year",
  section: "Section",
  batch: "Batch",
  student: "Student",
};

const DEFAULT_ALL_LABELS: Record<AcademicHierarchyLevel, string> = {
  institution: "All Institutions",
  college: "All Colleges",
  department: "All Departments",
  academicYear: "All Academic Years",
  section: "All Sections",
  batch: "All Batches",
  student: "All Students",
};

function isLevelConfig(item: AcademicHierarchyLevel | LevelConfig): item is LevelConfig {
  return typeof item === "object" && item !== null && "level" in item;
}

function getOptionsForLevel(
  level: AcademicHierarchyLevel,
  options: Pick<
    AcademicHierarchyFiltersProps,
    | "institutionOptions"
    | "collegeOptions"
    | "departmentOptions"
    | "academicYearOptions"
    | "sectionOptions"
    | "batchOptions"
    | "studentOptions"
  >
): SelectOption[] {
  switch (level) {
    case "institution":
      return options.institutionOptions || [];
    case "college":
      return options.collegeOptions;
    case "department":
      return options.departmentOptions;
    case "academicYear":
      return options.academicYearOptions;
    case "section":
      return options.sectionOptions;
    case "batch":
      return options.batchOptions;
    case "student":
      return options.studentOptions;
    default:
      return [];
  }
}

function getValueForLevel(level: AcademicHierarchyLevel, filters: AcademicFilters): string {
  switch (level) {
    case "institution":
    case "college":
      return filters.collegeId;
    case "department":
      return filters.department;
    case "academicYear":
      return filters.academicYear;
    case "section":
      return filters.section;
    case "batch":
      return filters.batchId;
    case "student":
      return filters.studentId;
    default:
      return "";
  }
}

function buildChangeForLevel(
  level: AcademicHierarchyLevel,
  value: string
): Partial<AcademicFilters> {
  switch (level) {
    case "institution":
    case "college":
      return { collegeId: value };
    case "department":
      return { department: value };
    case "academicYear":
      return { academicYear: value };
    case "section":
      return { section: value };
    case "batch":
      return { batchId: value };
    case "student":
      return { studentId: value };
    default:
      return {};
  }
}

const LAYOUT_CLASSES: Record<AcademicHierarchyLayout, string> = {
  responsive: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3",
  horizontal: "flex flex-wrap items-end gap-3",
  vertical: "flex flex-col gap-3",
  "grid-2": "grid grid-cols-1 sm:grid-cols-2 gap-3",
  "grid-3": "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3",
};

export function AcademicHierarchyFilters({
  levels = DEFAULT_LEVELS,
  institutionOptions,
  collegeOptions,
  departmentOptions,
  academicYearOptions,
  sectionOptions,
  batchOptions,
  studentOptions,
  filters,
  filterValidation,
  onChange,
  onReset,
  loading,
  className,
  selectClassName,
  labelClassName,
  disabled,
  layout = "responsive",
  showInstitution = false,
  showBatchToggle = false,
  appendContent,
}: AcademicHierarchyFiltersProps) {
  const baseId = useId();
  const resolvers = useEntityResolution();
  const { loading: lmsLoading } = useLMSData();
  const isLoading = loading ?? lmsLoading;

  const normalizedLevels: LevelConfig[] = levels.map((item) => {
    if (isLevelConfig(item)) return item;
    return { level: item, label: DEFAULT_LABELS[item] };
  });

  // Backward-compatible: if no levels explicitly include "institution" but the
  // showInstitution flag is set, prepend it.
  const effectiveLevels: LevelConfig[] = showInstitution
    ? normalizedLevels.some((l) => l.level === "institution")
      ? normalizedLevels
      : [{ level: "institution", label: DEFAULT_LABELS.institution }, ...normalizedLevels]
    : normalizedLevels;

  const isHorizontal = layout === "horizontal";
  const hasBatchLevel = effectiveLevels.some((l) => l.level === "batch");

  const batchOnlyMode = filters.batchOnlyMode ?? false;

  const handleToggleDisableRemaining = (checked: boolean) => {
    onChange({ batchOnlyMode: checked });
  };

  const [userRole, setUserRole] = useState<string | null>(null);
  useEffect(() => {
    try {
      const role = localStorage.getItem("lms_role");
      if (role) setUserRole(role);
    } catch {}
  }, []);

  return (
    <div className="space-y-4 w-full">
      {hasBatchLevel && showBatchToggle && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-3 text-sm font-medium text-foreground">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <span className="font-bold tracking-tight text-base">Batch Filtering</span>
          </div>
          
          <div className="flex bg-muted/50 p-1 rounded-full border border-border/50">
            <button
              type="button"
              onClick={() => handleToggleDisableRemaining(false)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ease-in-out",
                !batchOnlyMode 
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Combined (Recommended)
            </button>
            <button
              type="button"
              onClick={() => handleToggleDisableRemaining(true)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ease-in-out",
                batchOnlyMode 
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Batch Only
            </button>
          </div>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      )}
      <div
        className={cn(
          LAYOUT_CLASSES[layout],
          isHorizontal && "items-end",
          className
        )}
      >
        {effectiveLevels.map(({ level, label, allLabel, placeholder, disabled: levelDisabled }) => {
          // ⚠️ RBAC Strict Enforcer: College Admins and Students must NEVER see Institution or College filter dropdowns
          if ((level === "institution" || level === "college") && (userRole === "college_admin" || userRole === "student")) {
            return null;
          }
          const options = getOptionsForLevel(level, {
            institutionOptions,
            collegeOptions,
            departmentOptions,
            academicYearOptions,
            sectionOptions,
            batchOptions,
            studentOptions,
          } as Pick<
            AcademicHierarchyFiltersProps,
            | "institutionOptions"
            | "collegeOptions"
            | "departmentOptions"
            | "academicYearOptions"
            | "sectionOptions"
            | "batchOptions"
            | "studentOptions"
          >);
          const value = getValueForLevel(level, filters);
          const isBatchOnlyDisabled = batchOnlyMode && level !== "batch";
          const isDisabled = !!disabled || !!levelDisabled || !!loading || isBatchOnlyDisabled;
          const id = `${baseId}-${level}`;
          const fieldLabel = label ?? DEFAULT_LABELS[level];

          let resolveLabelFn = undefined;
          if (level === "institution" || level === "college") resolveLabelFn = resolvers.resolveInstitution;
          else if (level === "batch") resolveLabelFn = resolvers.resolveBatch;
          else if (level === "student") resolveLabelFn = resolvers.resolveStudent;

          return (
            <FilterDropdown
              key={level}
              label={fieldLabel}
              value={value}
              disabled={isDisabled}
              resolveLabel={resolveLabelFn}
              placeholder={allLabel ?? placeholder ?? DEFAULT_ALL_LABELS[level] ?? `All ${fieldLabel}s`}
              options={options}
              variant={level === "batch" ? "batch" : "default"}
              loading={isLoading}
              onChange={(val) => {
                const change = buildChangeForLevel(level, val);
                onChange(change);
              }}
            />
          );
        })}
        {appendContent}
      </div>
    </div>
  );
}
