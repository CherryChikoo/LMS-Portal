import {
  getDocuments,
  getDocument,
  addDocument,
  updateDocument,
  deleteDocument,
} from "@/lib/firebase/firestore";
import type { Resource, Student } from "@/types";
import { isAssignedToStudent } from "./assignment-engine";

const COLLECTION_NAME = "resources";

export async function getAllResources(): Promise<Resource[]> {
  return getDocuments<Resource>(COLLECTION_NAME);
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
  return deleteDocument(COLLECTION_NAME, id);
}

/**
 * Filter resources assigned to a specific student based on hierarchy or direct student target
 */
export function filterResourcesForStudent(resources: Resource[], student: Student): Resource[] {
  return resources.filter((res) => isAssignedToStudent(res.targets, student, res.sharedWith));
}
