"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Ban, CheckCircle2, Edit2, Trash2 } from "lucide-react";

type Student = {
  id: string;
  authId: string;
  collegeId: string;
  department: string | null;
  academicYear: string | null;
  section: string | null;
  createdAt: Date;
  updatedAt: Date;
  users: {
    id: string;
    displayName: string | null;
    email: string;
    role: string;
    status: string | null;
  } | null;
  colleges: {
    id: string;
    name: string;
    type: string | null;
  } | null;
  student_batches?: Array<{
    batchId: string;
    batches: {
      id: string;
      name: string;
    };
  }>;
};

interface VirtualizedStudentTableProps {
  students: Student[];
  isLoadingMore?: boolean;
  loadProgress?: number;
  onDelete?: (student: Student) => void;
  onToggleStatus?: (student: Student) => void;
  onEdit?: (student: Student) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function VirtualizedStudentTable({
  students,
  isLoadingMore = false,
  loadProgress = 100,
  onDelete,
  onToggleStatus,
  onEdit,
  selectedIds = [],
  onSelectionChange,
}: VirtualizedStudentTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtual scrolling - only renders visible rows
  const rowVirtualizer = useVirtualizer({
    count: students.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // Estimated row height in pixels
    overscan: 10, // Render 10 extra rows above/below viewport for smooth scrolling
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      {isLoadingMore && loadProgress < 100 && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Loading all students... {Math.round(loadProgress)}%
            </span>
            <span className="text-xs text-blue-700 dark:text-blue-300">
              {students.length.toLocaleString()} loaded
            </span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-2 transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Student count badge */}
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-sm">
          {students.length.toLocaleString()} Students
          {isLoadingMore && " (loading more...)"}
        </Badge>
      </div>

      {/* Virtualized Table */}
      <div
        ref={parentRef}
        className="border rounded-lg overflow-auto"
        style={{ height: "600px" }} // Fixed height for virtual scrolling
      >
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 border-b">
            <TableRow>
              {onSelectionChange && (
                <TableHead className="w-[50px]">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === students.length && students.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSelectionChange(students.map(s => s.id));
                      } else {
                        onSelectionChange([]);
                      }
                    }}
                    className="rounded border-border"
                  />
                </TableHead>
              )}
              <TableHead className="w-[250px]">Student</TableHead>
              <TableHead className="w-[200px]">College</TableHead>
              <TableHead className="w-[150px]">Department</TableHead>
              <TableHead className="w-[120px]">Year</TableHead>
              <TableHead className="w-[100px]">Section</TableHead>
              <TableHead className="w-[150px]">Batches</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              {(onEdit || onDelete || onToggleStatus) && (
                <TableHead className="w-[120px]">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Virtual rows container */}
            <tr style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              <td colSpan={7} style={{ padding: 0, border: 0 }}>
                <div style={{ position: "relative" }}>
                  {virtualItems.map((virtualRow) => {
                    const student = students[virtualRow.index];
                    if (!student) return null;

                    const user = student.users;
                    const college = student.colleges;
                    const batches = student.student_batches || [];

                    return (
                      <div
                        key={student.id}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div className="flex items-center border-b hover:bg-muted/50 transition-colors h-full">
                          {/* Checkbox */}
                          {onSelectionChange && (
                            <div className="w-[50px] px-4 flex items-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(student.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    onSelectionChange([...selectedIds, student.id]);
                                  } else {
                                    onSelectionChange(selectedIds.filter(id => id !== student.id));
                                  }
                                }}
                                className="rounded border-border"
                              />
                            </div>
                          )}
                          
                          {/* Student */}
                          <div className="w-[250px] px-4 flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {user?.displayName?.substring(0, 2).toUpperCase() || "ST"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate text-sm">
                                {user?.displayName || "Unknown"}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {user?.email}
                              </div>
                            </div>
                          </div>

                          {/* College */}
                          <div className="w-[200px] px-4">
                            <div className="text-sm truncate">{college?.name || "N/A"}</div>
                            {college?.type && (
                              <div className="text-xs text-muted-foreground truncate">
                                {college.type}
                              </div>
                            )}
                          </div>

                          {/* Department */}
                          <div className="w-[150px] px-4">
                            <span className="text-sm">{student.department || "N/A"}</span>
                          </div>

                          {/* Year */}
                          <div className="w-[120px] px-4">
                            <span className="text-sm">{student.academicYear || "N/A"}</span>
                          </div>

                          {/* Section */}
                          <div className="w-[100px] px-4">
                            <span className="text-sm">{student.section || "N/A"}</span>
                          </div>

                          {/* Batches */}
                          <div className="w-[150px] px-4">
                            {batches.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {batches.slice(0, 2).map((sb) => (
                                  <Badge key={sb.batchId} variant="outline" className="text-xs">
                                    {sb.batches.name}
                                  </Badge>
                                ))}
                                {batches.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{batches.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No batches</span>
                            )}
                          </div>

                          {/* Status */}
                          <div className="w-[100px] px-4">
                            <Badge
                              variant={
                                user?.status === "active"
                                  ? "default"
                                  : user?.status === "inactive"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="text-xs"
                            >
                              {user?.status || "unknown"}
                            </Badge>
                          </div>

                          {/* Actions */}
                          {(onEdit || onDelete || onToggleStatus) && (
                            <div className="w-[120px] px-4 flex items-center gap-1">
                              {onEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => onEdit(student)}
                                  title="Edit student"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {onToggleStatus && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => onToggleStatus(student)}
                                  title={user?.status === "restricted" ? "Activate" : "Restrict"}
                                >
                                  {user?.status === "restricted" ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                  ) : (
                                    <Ban className="w-3.5 h-3.5 text-yellow-500" />
                                  )}
                                </Button>
                              )}
                              {onDelete && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => onDelete(student)}
                                  title="Delete student"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </td>
            </tr>
          </TableBody>
        </Table>
      </div>

      {/* Footer stats */}
      <div className="text-xs text-muted-foreground text-center">
        Showing {virtualItems.length} of {students.length.toLocaleString()} rows (virtualized)
      </div>
    </div>
  );
}
