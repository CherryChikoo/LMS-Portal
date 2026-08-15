import { supabase } from '@/lib/supabase/client';
import { globalLoading } from "@/providers/global-loading-provider";
import type { College } from "@/types";
import {
  fetchCollegesAction,
  fetchCollegeByIdAction,
  createCollegeAction,
  updateCollegeAction,
  fetchCollegeStudentCountAction,
  softDeleteCollegeAction,
  restoreCollegeAction,
  renameCollegeAndMigrateAction,
  deleteDepartmentAndMigrateAction,
  renameDepartmentAndMigrateAction
} from '@/lib/actions/college-actions';

/**
 * Predefined department options for colleges
 */
export const PREDEFINED_DEPARTMENTS = [
  "Computer Science & Engineering (CSE)",
  "Electronics & Communication Engineering (ECE)",
  "Electrical & Electronics Engineering (EEE)",
  "Mechanical Engineering (ME)",
  "Civil Engineering (CE)",
  "Information Technology (IT)",
  "Artificial Intelligence & Data Science (AI&DS)",
  "Computer Science & Business Systems (CSBS)",
  "Biotechnology (BT)",
  "Chemical Engineering (CHE)",
  "Aerospace Engineering (AE)",
  "Automobile Engineering (AUTO)",
  "General",
  "Custom Department",
];

export function ensureGeneralDepartment(departments: string[]): string[] {
  const depts = [...departments];
  if (!depts.includes("General")) {
    depts.push("General");
  }
  return depts;
}

export async function fetchColleges(): Promise<{ data: College[], lastDoc: any }> {
  const data = await fetchCollegesAction();
  // We stringify and parse Dates to handle serialization back to standard plain objects for clients
  const parsedData = JSON.parse(JSON.stringify(data));
  return { data: parsedData as College[], lastDoc: data.length > 0 ? data[data.length - 1] : null };
}

export const getAllColleges = fetchColleges;

export async function fetchCollegeById(id: string): Promise<College | null> {
  const data = await fetchCollegeByIdAction(id);
  if (!data) return null;
  return JSON.parse(JSON.stringify(data)) as College;
}

export const getCollegeById = fetchCollegeById;

export async function createCollege(data: Partial<College>): Promise<string> {
  return await globalLoading.wrap(async () => {
    const name = data.name ? data.name.trim().toLowerCase() : "";

    const collegeData = {
      ...data,
      name,
      studentCount: 0,
      status: "active",
      isDeleted: false,
    };

    const id = await createCollegeAction(collegeData);
    return id;
  }, `Registering institution "${data.name || "New College"}"...`);
}

export async function updateCollege(
  id: string,
  data: Partial<College>
): Promise<void> {
  if (!id) return;

  return await globalLoading.wrap(async () => {
    const updateData = { ...data };
    if (updateData.name) {
      updateData.name = updateData.name.trim().toLowerCase();
    }

    // Only invoke update-college-auth API if admin credentials (email or password) are explicitly provided
    if (data.adminEmail || data.initialPassword) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (session) {
          const payload: Record<string, unknown> = { collegeId: id };
          if (data.adminEmail) payload.adminEmail = data.adminEmail;
          if (data.name) payload.collegeName = data.name;
          if (data.initialPassword) payload.password = data.initialPassword;

          const response = await fetch("/api/admin/update-college-auth", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            console.warn("College auth update warning:", body.error);
          }
        }
      } catch (authErr) {
        console.warn("Could not sync college admin auth credentials:", authErr);
      }
    }

    await updateCollegeAction(id, updateData);
  }, "Updating institution details...");
}

export async function deleteCollege(id: string, onProgress?: (msg: string) => void, studentUids?: string[]): Promise<void> {
  return await globalLoading.wrap(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    
    if (!session) {
      throw new Error("User must be authenticated to delete colleges");
    }

    if (onProgress) {
       onProgress("Deleting college and associated data...");
    }

    const res = await fetch("/api/admin/delete-college", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ id, studentUids }),
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(
        result.error ||
        result.message ||
        `Failed to delete college: ${res.status} ${res.statusText}`
      );
    }
  }, "Deleting institution and cascading records...");
}

export async function fetchCollegeStudentCount(collegeId: string): Promise<number> {
  return await fetchCollegeStudentCountAction(collegeId);
}

export async function updateCollegeStudentCount(
  collegeId: string,
  count: number
): Promise<void> {
  if (!collegeId) return;
  await updateCollegeAction(collegeId, { studentCount: count });
}

export async function softDeleteCollege(id: string): Promise<void> {
  if (!id) return;
  return await globalLoading.wrap(async () => {
    await softDeleteCollegeAction(id);
  }, "Deleting institution...");
}

export async function restoreCollege(id: string): Promise<void> {
  if (!id) return;
  return await globalLoading.wrap(async () => {
    await restoreCollegeAction(id);
  }, "Restoring institution...");
}

export async function renameCollegeAndMigrate(
  collegeId: string,
  oldName: string,
  newName: string,
  isExternal: boolean = false
): Promise<void> {
  return await globalLoading.wrap(async () => {
    await renameCollegeAndMigrateAction(collegeId, oldName, newName, isExternal);
  }, `Renaming institution to "${newName}" and updating student links...`);
}

export async function deleteDepartmentAndMigrate(
  collegeId: string,
  departmentName: string
): Promise<void> {
  await deleteDepartmentAndMigrateAction(collegeId, departmentName);
}

export async function renameDepartmentAndMigrate(
  collegeId: string,
  oldName: string,
  newName: string
): Promise<void> {
  await renameDepartmentAndMigrateAction(collegeId, oldName, newName);
}
