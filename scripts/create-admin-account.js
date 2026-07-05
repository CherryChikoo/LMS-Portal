require("dotenv").config({ path: ".env.local" });

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("crypto");

const ADMIN_EMAIL = (process.argv[2] || "admin@lms.dev").toLowerCase().trim();
const ADMIN_NAME = process.argv[3] || "Chief Assessment Officer";
const ADMIN_PASSWORD = process.argv[4];

function generatePassword(length = 16) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const adminAuth = getAuth();
const db = getFirestore();

async function main() {
  const password = ADMIN_PASSWORD || generatePassword();

  let userRecord;
  try {
    try {
      userRecord = await adminAuth.getUserByEmail(ADMIN_EMAIL);
      console.log(`Account already exists for ${ADMIN_EMAIL}. Updating password.`);
      await adminAuth.updateUser(userRecord.uid, { password });
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        userRecord = await adminAuth.createUser({
          email: ADMIN_EMAIL,
          password,
          displayName: ADMIN_NAME,
          emailVerified: true,
        });
      } else {
        throw err;
      }
    }

    const now = new Date();
    const userDoc = {
      id: userRecord.uid,
      email: ADMIN_EMAIL,
      displayName: ADMIN_NAME,
      role: "admin",
      department: "Faculty Operations",
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("users").doc(userRecord.uid).set(userDoc, { merge: true });

    console.log("\n✅ Admin account created/updated successfully.");
    console.log(`Email:    ${ADMIN_EMAIL}`);
    console.log(`Password: ${password}`);
    console.log(`UID:      ${userRecord.uid}\n`);
  } catch (err) {
    console.error("❌ Failed to create admin account:", err.message || err);
    process.exit(1);
  }
}

main();
