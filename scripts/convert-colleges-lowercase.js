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

async function convertCollegesToLowercase() {
  const snap = await db.collection("colleges").get();
  let updated = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const currentName = data.name || "";
    const lowerName = currentName.toLowerCase().trim();

    if (currentName !== lowerName) {
      console.log(`Updating college ${docSnap.id}: "${currentName}" => "${lowerName}"`);
      await docSnap.ref.update({
        name: lowerName,
        updatedAt: new Date(),
      });
      updated++;
    } else {
      console.log(`College ${docSnap.id} is already lowercase: "${lowerName}"`);
    }
  }

  // Also convert collegeName on students collection if present
  const studentSnap = await db.collection("students").get();
  let studentUpdated = 0;
  for (const sDoc of studentSnap.docs) {
    const sData = sDoc.data();
    if (sData.collegeName && sData.collegeName !== sData.collegeName.toLowerCase().trim()) {
      await sDoc.ref.update({
        collegeName: sData.collegeName.toLowerCase().trim(),
      });
      studentUpdated++;
    }
  }

  console.log(`\nMigration completed: ${updated} colleges updated to lowercase, ${studentUpdated} student profiles updated.`);
}

convertCollegesToLowercase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
