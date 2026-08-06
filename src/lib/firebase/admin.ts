import 'server-only';
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminApp(): App {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "lms-portal-ba7b0";
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Replace actual literal "\n" strings if they exist, and also standard escaped newlines.
  // Also strip out any surrounding double quotes that Vercel might have added when pasting.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/^"|"$/g, "")
    : undefined;

  if (getApps().length === 0) {
    if (projectId && clientEmail && privateKey) {
      try {
        return initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } catch (err: any) {
        console.error("FATAL: Failed to initialize Firebase Admin SDK. Check your FIREBASE_ADMIN_PRIVATE_KEY format.", err);
        throw new Error("Firebase Admin SDK failed to initialize: " + err.message);
      }
    } else {
      console.warn("Initializing Firebase Admin SDK without explicit credentials. (Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY)");
      return initializeApp({
        projectId,
      });
    }
  }

  return getApps()[0];
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

let adminDb: FirebaseFirestore.Firestore;
export function getAdminFirestore() {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp());
    adminDb.settings({ ignoreUndefinedProperties: true });
  }
  return adminDb;
}
