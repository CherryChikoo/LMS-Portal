import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  subscribeToDocuments,
  where,
  type QueryOptions,
  type PaginatedResult,
} from "@/lib/firebase/firestore";
import { auth } from "@/lib/firebase/config";
import type { Resource, Student } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";

const COLLECTION_NAME = "resources";

export function subscribeToAllResources(callback: (resources: Resource[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<Resource>(COLLECTION_NAME, callback, [], false, options);
}

export function subscribeToResourcesByCollege(collegeId: string, callback: (resources: Resource[]) => void, options?: QueryOptions): () => void {
  return subscribeToDocuments<Resource>(COLLECTION_NAME, callback, [where("collegeId", "==", collegeId)], false, options);
}

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
  return resources.filter((res) => isAssignedToStudent(res.targets, student, res.sharedWith));
}
