require("dotenv").config({ path: ".env.local" });

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const auth = getAuth();

async function listUsers() {
  const firestoreUsers = await db.collection("users").get();
  console.log(`Total Firestore users docs: ${firestoreUsers.size}`);
  firestoreUsers.docs.forEach((docSnap) => {
    const data = docSnap.data();
    console.log(`  FS ${docSnap.id} => ${data.email || "no email"} | role: ${data.role || "unknown"}`);
  });

  const authUsers = await auth.listUsers(1000);
  console.log(`\nTotal Auth users: ${authUsers.users.length}`);
  authUsers.users.forEach((u) => {
    console.log(`  Auth ${u.uid} => ${u.email || "no email"}`);
  });
}

listUsers().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
