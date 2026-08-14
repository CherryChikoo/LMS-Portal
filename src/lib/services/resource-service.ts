import { supabase } from "@/lib/supabase/client";
import { globalLoading } from "@/providers/global-loading-provider";
import type { Resource, Student } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";
import { toMillis } from "@/lib/utils/date";
import {
  getAllResourcesAction,
  getResourceByIdAction,
  createResourceAction,
  updateResourceAction
} from "@/lib/actions/resource-actions";

export async function getAllResources(): Promise<{ data: Resource[], lastDoc: any }> {
  const data = await getAllResourcesAction();
  const parsedData = JSON.parse(JSON.stringify(data));
  return { data: parsedData as Resource[], lastDoc: parsedData.length > 0 ? parsedData[parsedData.length - 1] : null };
}

export async function getResourceById(id: string): Promise<Resource | null> {
  const data = await getResourceByIdAction(id);
  if (!data) return null;
  return JSON.parse(JSON.stringify(data)) as Resource;
}

export async function createResource(data: Omit<Resource, "id">): Promise<string> {
  return await globalLoading.wrap(async () => {
    return await createResourceAction(data);
  }, `Publishing resource "${data.title}"...`);
}

export async function updateResource(id: string, data: Partial<Resource>): Promise<void> {
  return await globalLoading.wrap(async () => {
    await updateResourceAction(id, data);
  }, "Updating learning resource...");
}

export async function deleteResource(id: string): Promise<void> {
  return await globalLoading.wrap(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) throw new Error("Must be logged in to delete resource");
    
    const res = await fetch("/api/admin/delete-resource", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ id })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to delete resource via Admin API");
    }
  }, "Deleting learning resource...");
}

export function filterResourcesForStudent(resources: Resource[], student: Student): Resource[] {
  const studentCreatedMillis = toMillis(student.createdAt) ?? 0;

  return resources.filter((res) => {
    if (!isAssignedToStudent(res.targets, student, res.sharedWith)) return false;

    if (studentCreatedMillis > 0) {
      const resTimeMillis = toMillis(res.createdAt) ?? 0;
      if (resTimeMillis > 0 && resTimeMillis < studentCreatedMillis) {
        return false;
      }
    }

    return true;
  });
}
