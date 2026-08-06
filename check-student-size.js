const admin = require("firebase-admin");
require("dotenv").config({ path: ".env.local" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

async function checkStudents() {
  try {
    const studentsSnap = await db.collection("students").get();
    console.log(`Total Students: ${studentsSnap.size}`);
    
    let totalBytes = 0;
    studentsSnap.forEach(doc => {
      // Rough estimate of document size in Firestore
      // Sum of string lengths + basic overhead
      const data = doc.data();
      const jsonString = JSON.stringify(data);
      totalBytes += Buffer.byteLength(jsonString, 'utf8');
    });
    
    console.log(`Approximate average student document size: ${studentsSnap.size > 0 ? (totalBytes / studentsSnap.size).toFixed(2) : 0} bytes`);
    console.log(`Approximate total students collection size: ${(totalBytes / 1024).toFixed(2)} KB`);
  } catch(e) {
    console.error(e);
  }
}

checkStudents();
