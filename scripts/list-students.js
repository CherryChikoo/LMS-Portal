require("dotenv").config({ path: ".env.local" });

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

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

async function listStudents() {
  const snap = await db.collection("students").get();
  console.log(`Total students docs: ${snap.size}`);
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    console.log(`  ${docSnap.id} => ${data.email || "no email"} | ${data.name || "no name"}`);
  });
}

listStudents().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
