import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  where,
  type QueryOptions,
  type PaginatedResult,
} from "@/lib/firebase/firestore";
import { auth } from "@/lib/firebase/config";
import type { Resource, Student } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";
import { toMillis } from "@/lib/utils/date";

const COLLECTION_NAME = "resources";


export async function getAllResources(options?: QueryOptions): Promise<PaginatedResult<Resource>> {
  return getDocuments<Resource>(COLLECTION_NAME, [], false, options);
}

export async function getResourceById(id: string): Promise<Resource | null> {
  return getDocument<Resource>(COLLECTION_NAME, id);
}

export async function createResource(data: Omit<Resource, "id">): Promise<string> {
  return addDocument<Resource>(COLLECTION_NAME, data);
}

export async function updateResource(id: string, data: Partial<Resource>): Promise<void> {
  return updateDocument<Resource>(COLLECTION_NAME, id, data);
}

export async function deleteResource(id: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to delete resource");
  
  const token = await user.getIdToken();
  const res = await fetch("/api/admin/delete-resource", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ id })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Failed to delete resource via Admin API");
  }
}

/**
 * Filter resources assigned to a specific student based on hierarchy or direct student target
 */
export function filterResourcesForStudent(resources: Resource[], student: Student): Resource[] {
  const studentCreatedMillis = toMillis(student.createdAt) ?? 0;

  return resources.filter((res) => {
    if (!isAssignedToStudent(res.targets, student, res.sharedWith)) return false;

    // A newly created student shouldn't see ANY resources from the past that were created before they existed.
    // They ONLY see data assigned after their creation date.
    const resCreatedMillis = toMillis(res.createdAt) ?? 0;
    const wasCreatedBeforeStudent = resCreatedMillis > 0 && studentCreatedMillis > 0 && resCreatedMillis < studentCreatedMillis;

    if (wasCreatedBeforeStudent) {
      return false;
    }

    return true;
  });
}
