"use client";

import React, { memo } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Trash2, Power, Building2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Student } from "@/types";

interface StudentCardProps {
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

export const StudentCard = memo(function StudentCard({
  student,
  isSelected,
  onToggleSelect,
  onOpenEdit,
  onToggleStatus,
  onDeleteStudent,
  resolveInstitution,
  resolveBatch,
  pathname,
}: StudentCardProps) {
  const router = useRouter();

  const cId = student.collegeId ? student.collegeId.trim() : "";
  const cName = student.collegeName ? student.collegeName.trim() : "";
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

  const collegeName = !isInvalid(resolvedName)
    ? resolvedName
    : !isInvalid(cName)
    ? cName
    : !isInvalid(cId)
    ? cId
    : "Unassigned";

  return (
    <div
      onClick={() => router.push(`${pathname}/${student.id}`)}
      className={`rounded-2xl border p-4 bg-card flex flex-col justify-between space-y-3.5 shadow-sm transition-all active:scale-[0.99] cursor-pointer ${
        isSelected ? "border-brand bg-brand/5" : "border-border"
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(student.id);
            }}
            className="rounded border-border text-brand focus:ring-brand/50 cursor-pointer w-4 h-4 shrink-0"
          />
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold text-sm shrink-0">
            {student.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-foreground text-sm truncate leading-tight">{student.name}</h4>
            <p className="text-xs font-mono text-muted-foreground truncate mt-0.5">{student.email}</p>
          </div>
        </div>

        {/* Status Badge */}
        {student.status === "restricted" ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
            Restricted
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            Active
          </span>
        )}
      </div>

      {/* Meta Grid */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate text-muted-foreground">{collegeName}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate text-muted-foreground">{student.department || "General"}</span>
        </div>
      </div>

      {/* Footer Tags & Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          <span className="px-2 py-0.5 rounded bg-accent text-[10px] font-mono font-semibold text-foreground">
            Sec {student.section || "A"}
          </span>
          <span className="px-2 py-0.5 rounded bg-brand/10 text-brand text-[10px] font-mono font-semibold">
            {student.batchIds?.[0] ? resolveBatch(student.batchIds[0]) : "General"}
          </span>
        </div>

        {/* Mobile Action Buttons */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleStatus(student)}
            className="h-8 w-8 p-0 text-amber-500 hover:bg-amber-500/10 rounded-lg"
            title="Toggle Status"
          >
            <Power className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenEdit(student)}
            className="h-8 w-8 p-0 text-sky-500 hover:bg-sky-500/10 rounded-lg"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDeleteStudent(student)}
            className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-500/10 rounded-lg"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
