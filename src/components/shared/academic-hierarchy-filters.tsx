"use client";

import { useId, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { SelectOption } from "@/types";
import type { AcademicFilters } from "@/lib/hierarchy/hierarchy-data";
import type { AcademicHierarchyLevel } from "@/lib/hierarchy/use-academic-hierarchy";

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
  onChange: (filters: Partial<AcademicFilters>) => void;
  loading?: boolean;
  className?: string;
  selectClassName?: string;
  labelClassName?: string;
  disabled?: boolean;
  layout?: AcademicHierarchyLayout;
  showInstitution?: boolean;
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
      return {
        collegeId: value,
        department: "",
        academicYear: "",
        section: "",
        batchId: "",
        studentId: "",
      };
    case "department":
      return {
        department: value,
        academicYear: "",
        section: "",
        batchId: "",
        studentId: "",
      };
    case "academicYear":
      return {
        academicYear: value,
        section: "",
        batchId: "",
        studentId: "",
      };
    case "section":
      return {
        section: value,
        batchId: "",
        studentId: "",
      };
    case "batch":
      return {
        batchId: value,
        studentId: "",
      };
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
  onChange,
  loading,
  className,
  selectClassName,
  labelClassName,
  disabled,
  layout = "responsive",
  showInstitution = false,
}: AcademicHierarchyFiltersProps) {
  const baseId = useId();

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

  const [disableRemaining, setDisableRemaining] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("lms_disable_remaining_filters") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("lms_disable_remaining_filters") === "true";
      if (stored !== disableRemaining) {
        setDisableRemaining(stored);
      }
    } catch {}
  }, []);

  const handleToggleDisableRemaining = (checked: boolean) => {
    setDisableRemaining(checked);
    try {
      localStorage.setItem("lms_disable_remaining_filters", checked ? "true" : "false");
    } catch {}

    if (checked) {
      // Clear remaining parent filters when standalone batch mode is enabled
      onChange({
        collegeId: "",
        department: "",
        academicYear: "",
        section: "",
      });
    }
  };

  return (
    <div className="space-y-4 w-full">
      {hasBatchLevel && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-secondary/50 border border-border/80 text-sm font-medium text-foreground shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <span className="font-bold tracking-tight">Batch Filtering Mode</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={disableRemaining}
              onChange={(e) => handleToggleDisableRemaining(e.target.checked)}
              className="rounded border-border text-brand focus:ring-brand/50 w-4 h-4 cursor-pointer"
            />
            <span className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Disable remaining hierarchy filters (College, Dept, Year, Section)
            </span>
          </label>
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
          const isRemainingFilter = level !== "batch" && level !== "student";
          const isDisabled = disabled || levelDisabled || loading || options.length <= 1 || (disableRemaining && isRemainingFilter);
          const id = `${baseId}-${level}`;
          const fieldLabel = label ?? DEFAULT_LABELS[level];

          return (
            <div
              key={level}
              className={cn(
                "flex flex-col gap-1.5",
                isHorizontal && "min-w-[180px] flex-1"
              )}
            >
              <label
                htmlFor={id}
                className={cn(
                  "text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1",
                  labelClassName
                )}
              >
                {fieldLabel}
              </label>
              <select
                id={id}
                value={value}
                disabled={isDisabled}
                onChange={(e) => {
                  const change = buildChangeForLevel(level, e.target.value);
                  if (level === "batch" && disableRemaining && e.target.value !== "") {
                    Object.assign(change, {
                      collegeId: "",
                      department: "",
                      academicYear: "",
                      section: "",
                    });
                  }
                  onChange(change);
                }}
                className={cn(
                  "h-11 px-3.5 rounded-2xl bg-background border border-border text-sm font-semibold text-foreground focus:outline-none focus:border-brand w-full focus:ring-2 focus:ring-brand/20 transition-all",
                  isDisabled && "opacity-50 cursor-not-allowed bg-muted/50",
                  selectClassName
                )}
              >
                <option value="">{allLabel ?? placeholder ?? DEFAULT_ALL_LABELS[level] ?? `All ${fieldLabel}s`}</option>
                {options
                  .filter((o) => o.value !== "")
                  .map((o) => (
                    <option key={`${id}-${o.value}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
