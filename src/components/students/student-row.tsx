"use client";

import React, { memo } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Trash2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Student } from "@/types";

interface StudentRowProps {
  student: Student;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenEdit: (student: Student) => void;
  onToggleStatus: (student: Student) => void;
  onDeleteStudent: (student: Student) => void;
  resolveInstitution: (id: string) => string;
  resolveBatch: (id: string) => string;
  pathname: string;
}

function getYearBadgeStyle(year?: string) {
  const y = (year || "").toLowerCase();
  if (y.includes("1st") || y.includes("1")) return "bg-sky-500/10 text-sky-500 border border-sky-500/20";
  if (y.includes("2nd") || y.includes("2")) return "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20";
  if (y.includes("3rd") || y.includes("3")) return "bg-purple-500/10 text-purple-500 border border-purple-500/20";
  if (y.includes("4th") || y.includes("4")) return "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
  return "bg-secondary text-muted-foreground border border-border";
}

export const StudentRow = memo(function StudentRow({
  student,
  isSelected,
  onToggleSelect,
  onOpenEdit,
  onToggleStatus,
  onDeleteStudent,
  resolveInstitution,
  resolveBatch,
  pathname,
}: StudentRowProps) {
  const router = useRouter();

  return (
    <tr
      onClick={() => router.push(`${pathname}/${student.id}`)}
      className={`hover:bg-accent/40 transition-colors cursor-pointer ${
        isSelected ? "bg-brand/5" : ""
      }`}
    >
      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(student.id)}
          className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer w-4 h-4"
        />
      </td>
      <td className="py-3.5 px-4 font-medium text-foreground">
        <div className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-brand/20 transition-colors">
            {(student.name || student.email || "ST").slice(0, 2).toUpperCase()}
          </div>
          <span className="font-semibold text-foreground truncate">{student.name || student.email || "Unnamed Student"}</span>
        </div>
      </td>
      <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground truncate">{student.email}</td>
      <td className="py-3.5 px-4 font-medium text-foreground text-xs">
        {(() => {
          const cId = student.collegeId ? student.collegeId.trim() : "";
          const cName = resolveInstitution(student.collegeId) || "";
          const resolvedName = resolveInstitution(cId);

          const isInvalid = (val?: string | null) => {
            if (!val) return true;
            const norm = val.toLowerCase().trim();
            return (
              !norm ||
              norm === "unassigned" ||
              norm === "global" ||
              norm === "unknown institution" ||
              norm === "unknown" ||
              norm === "not specified" ||
              norm === "none"
            );
          };

          let displayCol = "";
          if (!isInvalid(resolvedName)) {
            displayCol = resolvedName;
          } else if (!isInvalid(cName)) {
            displayCol = cName;
          } else if (!isInvalid(cId)) {
            displayCol = cId;
          }

          if (!displayCol) {
            return (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold uppercase tracking-wider">
                Unassigned
              </span>
            );
          }

          if (displayCol.includes("(Deleted)")) {
            return <span className="text-rose-500 font-bold">{displayCol}</span>;
          }
          return displayCol;
        })()}
      </td>
      <td className="py-3.5 px-4 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground">{student.department}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${getYearBadgeStyle(student.academicYear)}`}>
            {student.academicYear || "1st Year"}
          </span>
        </div>
      </td>
      <td className="py-3.5 px-4 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 max-w-[280px]">
          <span className="px-2 py-0.5 rounded-md bg-accent border border-border/60 font-mono text-[11px] font-semibold text-foreground whitespace-nowrap">
            {student.section || "N/A"}
          </span>
          {(() => {
            const rawBatchList = (student.batches && student.batches.length > 0)
              ? student.batches.map(b => b.name)
              : (student.batchNames && student.batchNames.length > 0)
              ? student.batchNames
              : (student.batchIds || []).map(b => resolveBatch(b));

            const uniqueBatches = Array.from(new Set(rawBatchList.filter(Boolean)));
            const count = uniqueBatches.length || student.batchCount || (student.batchIds || []).length || 0;

            if (count === 0) {
              return (
                <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/40 font-mono text-[11px] font-semibold whitespace-nowrap">
                  0 Batches
                </span>
              );
            }

            return (
              <span
                className="px-2 py-0.5 rounded-md bg-brand/10 border border-brand/20 font-mono text-[11px] font-semibold text-brand whitespace-nowrap cursor-help"
                title={uniqueBatches.length > 0 ? `Assigned Batches (${count}):\n• ` + uniqueBatches.join('\n• ') : `${count} Batches`}
              >
                {count} {count === 1 ? "Batch" : "Batches"}
              </span>
            );
          })()}
        </div>
      </td>
      <td className="py-3.5 px-4">
        {student.status === "restricted" ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Restricted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        )}
      </td>
      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleStatus(student)}
            className={`h-8 px-2 text-xs font-semibold rounded-lg ${
              student.status === "restricted"
                ? "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20"
                : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
            }`}
            title={student.status === "restricted" ? "Reactivate Student" : "Restrict Student"}
          >
            <Power className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenEdit(student)}
            className="h-8 w-8 p-0 text-sky-500 hover:text-sky-600 hover:bg-sky-500/10 rounded-lg"
            title="Edit Student Profile"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDeleteStudent(student)}
            className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg"
            title="Remove Student Profile"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}, (prev, next) => {
  return (
    prev.student.id === next.student.id &&
    prev.student.status === next.student.status &&
    prev.student.name === next.student.name &&
    prev.student.email === next.student.email &&
    prev.student.collegeId === next.student.collegeId &&
    prev.student.department === next.student.department &&
    prev.student.academicYear === next.student.academicYear &&
    prev.student.section === next.student.section &&
    prev.isSelected === next.isSelected &&
    prev.pathname === next.pathname
  );
});
