import { getErrorMessage } from '@/lib/utils/error';
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";

// OPTIMIZATION: Increase timeout for large-scale operations
// Hobby tier: 10s, Pro tier: 300s (5 min), Enterprise: 900s (15 min)
export const maxDuration = 300; // 5 minutes - requires Vercel Pro tier for large datasets

const WIPE_SECRET = process.env.WIPE_SECRET || "MASTER_FACTORY_RESET_SECRET_2026";
const PRESERVED_EMAIL = "trainer@gmail.com";

// Collections to completely clear
const TARGET_COLLECTIONS = [
  "exams",
  "batches",
  "students",
  "exam_results",
  "examResults",
  "submissions",
  "assessments",
  "colleges",
  "resources",
  "doubts",
];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const reqSecret = body.secret || req.headers.get("x-wipe-secret");

    // 1. Security Authorization Guard
    if (!reqSecret || reqSecret !== WIPE_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing reset secret key." },
        { status: 403 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    let deletedAuthUsersCount = 0;
    let deletedFirestoreDocsCount = 0;

    // OPTIMIZATION: Parallelize independent deletion operations
    // Auth deletion and Firestore collection deletion can happen simultaneously
    
    const [authStats, firestoreStats] = await Promise.all([
      // Parallel Task 1: Delete Auth users
      deleteAuthUsers(auth),
      // Parallel Task 2: Delete Firestore collections
      deleteFirestoreCollections(db)
    ]);

    deletedAuthUsersCount = authStats.deletedCount;
    deletedFirestoreDocsCount = firestoreStats.deletedCount;

    console.log(`[FACTORY RESET] COMPLETED SUCCESSFULLY. Wiped ${deletedAuthUsersCount} Auth users & ${deletedFirestoreDocsCount} Firestore docs. Preserved ${PRESERVED_EMAIL}.`);

    return NextResponse.json({
      success: true,
      message: "Global Factory Reset completed successfully. All data wiped except master trainer account.",
      preservedUser: PRESERVED_EMAIL,
      stats: {
        deletedAuthUsersCount,
        deletedFirestoreDocsCount,
        clearedCollections: [...TARGET_COLLECTIONS, "users (except trainer@gmail.com)"],
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

// OPTIMIZATION: Extract Auth deletion into separate function for parallel execution
async function deleteAuthUsers(auth: ReturnType<typeof getAdminAuth>): Promise<{ deletedCount: number }> {
  const uidsToDelete: string[] = [];
  let nextPageToken: string | undefined = undefined;

  // Phase 1: Collect all user IDs to delete
  do {
    const listUsersResult = await auth.listUsers(1000, nextPageToken);
    listUsersResult.users.forEach((userRecord) => {
      const userEmail = (userRecord.email || "").toLowerCase();
      if (userEmail === PRESERVED_EMAIL) {
        console.log(`[FACTORY RESET] PRESERVING AUTH USER: ${userRecord.email} (${userRecord.uid})`);
        return;
      }
      uidsToDelete.push(userRecord.uid);
    });
    nextPageToken = listUsersResult.pageToken;
  } while (nextPageToken);

  // Phase 2: Delete in batches of 1000 (Firebase Admin API limit)
  let deletedCount = 0;
  const BATCH_SIZE = 1000;
  
  for (let i = 0; i < uidsToDelete.length; i += BATCH_SIZE) {
    const chunk = uidsToDelete.slice(i, i + BATCH_SIZE);
    try {
      const deleteResult = await auth.deleteUsers(chunk);
      deletedCount += deleteResult.successCount;
      if (deleteResult.failureCount > 0) {
        console.error(`[FACTORY RESET] Failed to delete ${deleteResult.failureCount} Auth users`, deleteResult.errors);
      }
    } catch (error) {
      console.error(`[FACTORY RESET] Auth deletion batch failed at index ${i}:`, error);
    }
  }

  return { deletedCount };
}

// OPTIMIZATION: Extract Firestore deletion into separate function for parallel execution
async function deleteFirestoreCollections(db: ReturnType<typeof getAdminFirestore>): Promise<{ deletedCount: number }> {
  let totalDeleted = 0;

  // OPTIMIZATION: Delete target collections in parallel
  const collectionDeletionPromises = TARGET_COLLECTIONS.map(async (collectionName) => {
    let collectionDeletedCount = 0;
    const collectionRef = db.collection(collectionName);
    
    let snapshot = await collectionRef.limit(500).get();
    
    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        collectionDeletedCount++;
      });
      await batch.commit();
      
      // Fetch next batch
      snapshot = await collectionRef.limit(500).get();
    }
    
    console.log(`[FACTORY RESET] Deleted ${collectionDeletedCount} docs from ${collectionName}`);
    return collectionDeletedCount;
  });

  // Wait for all collection deletions to complete
  const collectionResults = await Promise.all(collectionDeletionPromises);
  totalDeleted += collectionResults.reduce((sum, count) => sum + count, 0);

  // Delete users collection (with exception for trainer@gmail.com)
  const usersDeleted = await deleteUsersCollection(db);
  totalDeleted += usersDeleted;

  return { deletedCount: totalDeleted };
}

// OPTIMIZATION: Extract users collection deletion with preserved user handling
async function deleteUsersCollection(db: ReturnType<typeof getAdminFirestore>): Promise<number> {
  const usersRef = db.collection("users");
  const usersSnapshot = await usersRef.get();

  let batch = db.batch();
  let batchOperationCount = 0;
  let deletedCount = 0;

  for (const doc of usersSnapshot.docs) {
    const docData = doc.data();
    const userEmail = (docData.email || "").toLowerCase();

    if (userEmail === PRESERVED_EMAIL || doc.id === PRESERVED_EMAIL) {
      console.log(`[FACTORY RESET] PRESERVING FIRESTORE USER DOC: ${doc.id} (${userEmail})`);
      continue;
    }

    batch.delete(doc.ref);
    deletedCount++;
    batchOperationCount++;

    // Commit in chunks of 500 (Firestore limit)
    if (batchOperationCount === 500) {
      await batch.commit();
      batch = db.batch();
      batchOperationCount = 0;
    }
  }

  // Commit remaining operations
  if (batchOperationCount > 0) {
    await batch.commit();
  }

  console.log(`[FACTORY RESET] Deleted ${deletedCount} docs from users collection`);
  return deletedCount;
}
