import { getErrorMessage } from '@/lib/utils/error';
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";

export const maxDuration = 60; // Max execution time for Vercel Hobby tier

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

    // -------------------------------------------------------------
    // 2. Firebase Auth Wipe (Strict Exception for trainer@gmail.com)
    // -------------------------------------------------------------
    const uidsToDelete: string[] = [];
    let nextPageToken: string | undefined = undefined;

    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      listUsersResult.users.forEach((userRecord) => {
        const userEmail = (userRecord.email || "").toLowerCase();
        // STRICT EXCEPTION CHECK
        if (userEmail === PRESERVED_EMAIL) {
          console.log(`[FACTORY RESET] PRESERVING AUTH USER: ${userRecord.email} (${userRecord.uid})`);
          return;
        }
        uidsToDelete.push(userRecord.uid);
      });
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    // Delete Auth users in batches of 1000 (Firebase Admin API limit)
    for (let i = 0; i < uidsToDelete.length; i += 1000) {
      const chunk = uidsToDelete.slice(i, i + 1000);
      const deleteResult = await auth.deleteUsers(chunk);
      deletedAuthUsersCount += deleteResult.successCount;
      if (deleteResult.failureCount > 0) {
        console.error(`[FACTORY RESET] Failed to delete ${deleteResult.failureCount} Auth users`, deleteResult.errors);
      }
    }

    // -------------------------------------------------------------
    // 3. Firestore Database Wipe (Targeted Collections)
    // -------------------------------------------------------------
    for (const collectionName of TARGET_COLLECTIONS) {
      const collectionRef = db.collection(collectionName);
      let snapshot = await collectionRef.limit(500).get();

      while (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
          deletedFirestoreDocsCount++;
        });
        await batch.commit();
        snapshot = await collectionRef.limit(500).get();
      }
    }

    // -------------------------------------------------------------
    // 4. Firestore `users` Collection Wipe (Strict Exception for trainer@gmail.com)
    // -------------------------------------------------------------
    const usersRef = db.collection("users");
    let usersSnapshot = await usersRef.get();

    let batch = db.batch();
    let batchOperationCount = 0;

    for (const doc of usersSnapshot.docs) {
      const docData = doc.data();
      const userEmail = (docData.email || "").toLowerCase();

      // STRICT EXCEPTION CHECK
      if (userEmail === PRESERVED_EMAIL || doc.id === PRESERVED_EMAIL) {
        console.log(`[FACTORY RESET] PRESERVING FIRESTORE USER DOC: ${doc.id} (${userEmail})`);
        continue;
      }

      batch.delete(doc.ref);
      deletedFirestoreDocsCount++;
      batchOperationCount++;

      // Commit in chunks of 500 (Firestore limit)
      if (batchOperationCount === 500) {
        await batch.commit();
        batch = db.batch();
        batchOperationCount = 0;
      }
    }

    if (batchOperationCount > 0) {
      await batch.commit();
    }

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
