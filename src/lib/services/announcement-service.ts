import { supabase } from "@/lib/supabase/client";
import type { Announcement } from "@/types";

const ANNOUNCEMENTS_COLLECTION = "announcements";

export async function getAllAnnouncements(): Promise<{ data: Announcement[], lastDoc: any }> {
  // The announcements table does not exist in the database schema.
  return { data: [], lastDoc: null };
}

export function filterAnnouncementsForStudent(
  announcements: Announcement[],
  uid: string,
  email?: string
): Announcement[] {
  if (!uid && !email) return [];

  const normalizedUid = (uid || "").toLowerCase().trim();
  const normalizedEmail = (email || "").toLowerCase().trim();

  return announcements.filter((a) => {
    const audience = (a.targetAudience || []).map((t) => t.toLowerCase().trim());
    if (audience.length === 0) return true;

    if (audience.includes("all") || audience.includes("all students")) {
      return true;
    }

    if (normalizedUid && audience.includes(normalizedUid)) return true;
    if (normalizedEmail && audience.includes(normalizedEmail)) return true;

    return false;
  });
}

export async function getAnnouncementsForCurrentUser(
  uid: string,
  email?: string
): Promise<Announcement[]> {
  const all = await getAllAnnouncements();
  return filterAnnouncementsForStudent(all.data, uid, email);
}
