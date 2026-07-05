require("dotenv").config({ path: ".env.local" });

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const KEEP_EMAILS = [
  "trainer@lms.dev",
  "lohitpawanmail@gmail.com",
];

const normalize = (email) => (email || "").toLowerCase().trim();

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

async function cleanupFirestoreUsers() {
  const snap = await db.collection("users").get();
  let deleted = 0;
  let kept = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const email = normalize(data.email);
    if (KEEP_EMAILS.includes(email)) {
      console.log(`Keeping users/${docSnap.id} => ${email}`);
      kept++;
    } else {
      console.log(`Deleting users/${docSnap.id} => ${email}`);
      await docSnap.ref.delete();
      deleted++;
    }
  }

  console.log(`\nFirestore users cleanup: ${deleted} deleted, ${kept} kept`);
}

cleanupFirestoreUsers().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
