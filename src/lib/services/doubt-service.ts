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
import type { DoubtDiscussion } from "@/types";

const COLLECTION_NAME = "doubts";

export async function getAllDoubts(options?: QueryOptions): Promise<PaginatedResult<DoubtDiscussion>> {
  return getDocuments<DoubtDiscussion>(COLLECTION_NAME, [], false, options);
}

export async function getDoubtsByStudent(studentId: string, options?: QueryOptions): Promise<PaginatedResult<DoubtDiscussion>> {
  return getDocuments<DoubtDiscussion>(COLLECTION_NAME, [where("studentId", "==", studentId)], false, options);
}

export async function getDoubtById(id: string): Promise<DoubtDiscussion | null> {
  return getDocument<DoubtDiscussion>(COLLECTION_NAME, id);
}

export async function createDoubt(data: Omit<DoubtDiscussion, "id">): Promise<string> {
  return addDocument<DoubtDiscussion>(COLLECTION_NAME, data);
}

export async function replyToDoubt(id: string, reply: any, repliedBy?: string): Promise<void> {
  const replyText = typeof reply === "string" ? reply : reply?.text || "";
  const author = repliedBy || (typeof reply === "object" ? reply.authorName : "Trainer");

  const doubt = await getDoubtById(id);
  const currentReplies = doubt?.replies || [];
  const newReply = typeof reply === "object" ? reply : { id: `rep-${Date.now()}`, authorId: "", authorName: author, role: "trainer", text: replyText, createdAt: new Date() };

  return updateDocument<DoubtDiscussion>(COLLECTION_NAME, id, {
    reply: replyText,
    repliedBy: author,
    replies: [...currentReplies, newReply],
    status: "resolved",
    updatedAt: new Date(),
  });
}

export async function deleteDoubt(id: string): Promise<void> {
  return deleteDocument(COLLECTION_NAME, id);
}

export async function updateDoubt(id: string, data: Partial<DoubtDiscussion>): Promise<void> {
  return updateDocument<DoubtDiscussion>(COLLECTION_NAME, id, data);
}
