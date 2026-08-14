import { supabase } from "@/lib/supabase/client";
import type { DoubtDiscussion } from "@/types";
import {
  getAllDoubtsAction,
  getDoubtsByStudentAction,
  getDoubtByIdAction,
  createDoubtAction,
  replyToDoubtAction,
  deleteDoubtAction,
  updateDoubtAction
} from "@/lib/actions/doubt-actions";

export async function getAllDoubts(): Promise<{ data: DoubtDiscussion[], lastDoc: any }> {
  const data = await getAllDoubtsAction();
  const parsedData = JSON.parse(JSON.stringify(data));
  return { data: parsedData as DoubtDiscussion[], lastDoc: parsedData.length > 0 ? parsedData[parsedData.length - 1] : null };
}

export async function getDoubtsByStudent(studentId: string): Promise<{ data: DoubtDiscussion[], lastDoc: any }> {
  const data = await getDoubtsByStudentAction(studentId);
  const parsedData = JSON.parse(JSON.stringify(data));
  return { data: parsedData as DoubtDiscussion[], lastDoc: parsedData.length > 0 ? parsedData[parsedData.length - 1] : null };
}

export async function getDoubtById(id: string): Promise<DoubtDiscussion | null> {
  const data = await getDoubtByIdAction(id);
  if (!data) return null;
  const doubt = JSON.parse(JSON.stringify(data));
  
  // Map Prisma doubt_replies to replies for frontend compatibility
  doubt.replies = doubt.doubt_replies || [];
  delete doubt.doubt_replies;
  
  return doubt as DoubtDiscussion;
}

export async function createDoubt(data: Omit<DoubtDiscussion, "id">): Promise<string> {
  // Filter out any virtual fields that aren't in Prisma schema
  const { studentName, resourceTitle, reply, repliedBy, replies, ...cleanData } = data as any;
  return await createDoubtAction({
    ...cleanData,
    id: `doubt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  });
}

export async function replyToDoubt(id: string, reply: any, repliedBy?: string): Promise<void> {
  const replyText = typeof reply === "string" ? reply : reply?.text || "";
  const author = repliedBy || (typeof reply === "object" ? reply.authorName : "Trainer");
  
  // Get current user ID to satisfy Prisma relation
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const authorId = session?.user?.id || "unknown";

  await replyToDoubtAction(id, replyText, author, authorId);
}

export async function deleteDoubt(id: string): Promise<void> {
  await deleteDoubtAction(id);
}

export async function updateDoubt(id: string, data: Partial<DoubtDiscussion>): Promise<void> {
  await updateDoubtAction(id, data);
}
