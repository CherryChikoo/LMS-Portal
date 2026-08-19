import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// maxDuration removed - causing Next.js 16 build issues
// export const maxDuration = 60;

const WIPE_SECRET = process.env.ADMIN_WIPE_SECRET_KEY;
const PRESERVED_EMAIL = "trainer@gmail.com";
const TARGET_COLLECTIONS = [
  "colleges",
  "batches",
  "students",
  "exams",
  "questions",
  "exam_results",
  "resources",
  "trainer_notes",
  "doubts",
  "doubt_replies",
  "student_batches",
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(req: Request) {
  try {
    const { reqSecret } = await req.json();

    if (!WIPE_SECRET) {
      return NextResponse.json(
        { error: "Server misconfiguration: ADMIN_WIPE_SECRET_KEY is not set." },
        { status: 500 }
      );
    }

    if (!reqSecret || reqSecret !== WIPE_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing reset secret key." },
        { status: 403 }
      );
    }

    let deletedAuthUsersCount = 0;
    let deletedFirestoreDocsCount = 0;

    const [authStats, dbStats] = await Promise.all([
      deleteAuthUsers(),
      deleteDatabaseTables()
    ]);

    deletedAuthUsersCount = authStats.deletedCount;
    deletedFirestoreDocsCount = dbStats.deletedCount;

    console.log(`[FACTORY RESET] COMPLETED SUCCESSFULLY. Wiped ${deletedAuthUsersCount} Auth users & ${deletedFirestoreDocsCount} DB rows. Preserved ${PRESERVED_EMAIL}.`);

    return NextResponse.json({
      success: true,
      message: "Global Factory Reset completed successfully. All data wiped except master trainer account.",
      preservedUser: PRESERVED_EMAIL,
      stats: {
        deletedAuthUsersCount,
        deletedDatabaseRowsCount: deletedFirestoreDocsCount,
        clearedTables: [...TARGET_COLLECTIONS, "users (except trainer@gmail.com)"],
      },
    });
  } catch (error: unknown) {
    console.error("[FACTORY RESET FATAL ERROR]", error);
    return NextResponse.json(
      { error: error instanceof Error ? getErrorMessage(error) : "Internal Server Error during Factory Reset" },
      { status: 500 }
    );
  }
}

async function deleteAuthUsers(): Promise<{ deletedCount: number }> {
  let deletedCount = 0;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    
    if (data && data.users) {
      for (const user of data.users) {
        if (user.email?.toLowerCase() === PRESERVED_EMAIL) continue;
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        deletedCount++;
      }
    }
  } catch (e) {
    console.error("Error deleting auth users", e);
  }
  return { deletedCount };
}

async function deleteDatabaseTables(): Promise<{ deletedCount: number }> {
  let totalDeleted = 0;

  for (const table of TARGET_COLLECTIONS) {
    try {
      const model = (prisma as any)[table];
      if (model && model.deleteMany) {
        const { count } = await model.deleteMany({});
        totalDeleted += count || 0;
      }
    } catch (e) {
      console.error(`Error deleting from ${table}`, e);
    }
  }

  // Delete from users except preserved
  try {
    const { count } = await prisma.users.deleteMany({
      where: {
        email: { not: PRESERVED_EMAIL }
      }
    });
    totalDeleted += count || 0;
  } catch (e) {
    console.error("Error deleting from users", e);
  }

  return { deletedCount: totalDeleted };
}
