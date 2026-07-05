import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Load environment variables from .env.local
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "..", ".env.local");

function loadEnv() {
  try {
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes if present
      const cleanValue = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
      process.env[key] = cleanValue;
    }
  } catch (e) {
    console.error("Failed to load .env.local:", e.message);
    process.exit(1);
  }
}

loadEnv();

// Initialize Firebase Admin SDK
const adminApp =
  getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      })
    : getApps()[0];

const adminAuth = getAuth(adminApp);

// Emails to preserve (case-insensitive)
const PRESERVE_EMAILS = new Set([
  "trainer@lms.dev",
  "lohitpawanmail@gmail.com",
]);

async function cleanupUsers() {
  console.log("Starting Firebase Auth user cleanup...");
  console.log("Preserving emails:", [...PRESERVE_EMAILS].join(", "));
  console.log("");

  let totalUsers = 0;
  let deletedCount = 0;
  let preservedCount = 0;
  let nextPageToken = undefined;

  do {
    const result = await adminAuth.listUsers(1000, nextPageToken);
    totalUsers += result.users.length;

    for (const user of result.users) {
      const email = user.email?.toLowerCase() || "";
      const shouldPreserve = email && PRESERVE_EMAILS.has(email);

      if (shouldPreserve) {
        console.log(`  PRESERVE: ${user.uid} (${user.email})`);
        preservedCount++;
      } else {
        console.log(`  DELETE:   ${user.uid} (${user.email || "no email"})`);
        try {
          await adminAuth.deleteUser(user.uid);
          deletedCount++;
        } catch (err) {
          console.error(`    ERROR deleting ${user.uid}:`, err.message);
        }
      }
    }

    nextPageToken = result.pageToken;
  } while (nextPageToken);

  console.log("");
  console.log("=== Cleanup Summary ===");
  console.log(`Total users processed: ${totalUsers}`);
  console.log(`Users deleted: ${deletedCount}`);
  console.log(`Users preserved: ${preservedCount}`);

  // Verify remaining users
  console.log("");
  console.log("=== Verification: Remaining Users ===");
  let remainingUsers = [];
  nextPageToken = undefined;
  do {
    const result = await adminAuth.listUsers(1000, nextPageToken);
    remainingUsers.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  const remainingEmails = remainingUsers.map(u => u.email?.toLowerCase() || "").filter(Boolean);
  console.log(`Remaining user count: ${remainingUsers.length}`);
  console.log("Remaining emails:");
  for (const email of remainingEmails.sort()) {
    console.log(`  - ${email}`);
  }

  // Check if only the two expected emails remain
  const expectedEmails = [...PRESERVE_EMAILS].sort();
  const actualEmails = remainingEmails.sort();

  if (JSON.stringify(actualEmails) === JSON.stringify(expectedEmails)) {
    console.log("");
    console.log("✓ VERIFICATION PASSED: Only the expected users remain.");
  } else {
    console.log("");
    console.log("✗ VERIFICATION FAILED: Remaining users do not match expected.");
    console.log("Expected:", expectedEmails.join(", "));
    console.log("Actual:", actualEmails.join(", "));
    process.exit(1);
  }
}

cleanupUsers().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});