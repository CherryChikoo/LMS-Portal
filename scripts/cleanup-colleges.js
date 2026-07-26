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

const RESERVED_OR_TEST_NAMES = [
  "all colleges",
  "all institutions",
  "artificial intelligence & machine learning (ai & ml)",
  "college 1",
  "college 2",
  "college 3",
  "default college",
  "unassigned",
  "select college",
  "global",
];

async function cleanupColleges() {
  const snap = await db.collection("colleges").get();
  let deletedCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const nameLower = (data.name || "").toLowerCase().trim();
    const idLower = docSnap.id.toLowerCase().trim();

    const isJunk = RESERVED_OR_TEST_NAMES.some(
      (term) => nameLower === term || idLower.includes(term.replace(/\s+/g, "-"))
    );

    if (isJunk) {
      console.log(`Deleting random/test college: ID=${docSnap.id}, Name="${data.name}"`);
      await docSnap.ref.delete();
      deletedCount++;
    } else {
      console.log(`Keeping valid college: ID=${docSnap.id}, Name="${data.name}"`);
    }
  }

  console.log(`\nCleanup finished: Removed ${deletedCount} random/test colleges.`);
}

cleanupColleges()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
