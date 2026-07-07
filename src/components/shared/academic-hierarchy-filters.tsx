"use client";

import { useId } from "react";
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

export type AcademicHierarchyLayout = "horizontal" | "vertical" | "responsive";

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

  return (
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
        const isDisabled = disabled || levelDisabled || loading || options.length <= 1;
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
                "text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1",
                labelClassName
              )}
            >
              {fieldLabel}
            </label>
            <select
              id={id}
              value={value}
              disabled={isDisabled}
              onChange={(e) => onChange(buildChangeForLevel(level, e.target.value))}
              className={cn(
                "h-10 px-3 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-none focus:border-brand w-full",
                isDisabled && "opacity-60 cursor-not-allowed",
                selectClassName
              )}
            >
              <option value="">{allLabel ?? placeholder ?? `All ${fieldLabel}s`}</option>
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
  );
}
