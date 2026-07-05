import { getDocuments } from "@/lib/firebase/firestore";
import type { Announcement } from "@/types";

const ANNOUNCEMENTS_COLLECTION = "announcements";

export async function getAllAnnouncements(): Promise<Announcement[]> {
  return getDocuments<Announcement>(ANNOUNCEMENTS_COLLECTION);
}

/**
 * Filter announcements intended for a specific student.
 * Announcements use a legacy `targetAudience` array of identifiers.
 * A student matches when the audience contains "all" / "all students",
 * the student's uid, or the student's email.
 */
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

/**
 * Fetch announcements visible to the currently signed-in student.
 */
export async function getAnnouncementsForCurrentUser(
  uid: string,
  email?: string
): Promise<Announcement[]> {
  const all = await getAllAnnouncements();
  return filterAnnouncementsForStudent(all, uid, email);
}
