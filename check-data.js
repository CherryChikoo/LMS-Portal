const admin = require("firebase-admin");
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = admin.firestore();

async function checkData() {
  try {
    const collegesSnap = await db.collection("colleges").get();
    console.log(`Colleges count: ${collegesSnap.size}`);
    collegesSnap.forEach(doc => console.log(`- ${doc.id}: ${doc.data().name}`));

    const studentsSnap = await db.collection("students").get();
    console.log(`Students count: ${studentsSnap.size}`);
  } catch(e) {
    console.error(e);
  }
}

checkData();
