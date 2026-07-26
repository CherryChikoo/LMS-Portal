require("dotenv").config({ path: ".env.local" });

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const KEEP_EMAILS = [
  "trainer@gmail.com",
  "tallurisanju1@gmail.com",
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

const adminAuth = getAuth();
const db = getFirestore();

async function copyStudentNameToResults(studentId, studentData) {
  if (!studentId || !studentData) return;
  const resultsSnap = await db.collection("exam_results").where("studentId", "==", studentId).get();
  const batch = db.batch();
  resultsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (!data.studentName && studentData.name) {
      batch.update(docSnap.ref, { studentName: studentData.name });
    }
  });
  await batch.commit();
}

async function deleteAllExceptKeep() {
  console.log("Fetching Firebase Auth users...");

  let nextPageToken;
  let deletedAuthCount = 0;
  let deletedStudentCount = 0;
  let deletedUserCount = 0;

  do {
    const listResult = await adminAuth.listUsers(1000, nextPageToken);
    nextPageToken = listResult.pageToken;

    for (const userRecord of listResult.users) {
      const email = normalize(userRecord.email);
      if (KEEP_EMAILS.includes(email)) {
        console.log(`Keeping ${email} (${userRecord.uid})`);
        continue;
      }

      const uid = userRecord.uid;
      console.log(`Deleting ${email || uid} (${uid})`);

      // Try to find and delete the student record by UID, then by email
      const studentById = await db.collection("students").doc(uid).get();
      if (studentById.exists) {
        await copyStudentNameToResults(uid, studentById.data());
        await db.collection("students").doc(uid).delete();
        deletedStudentCount++;
      } else if (email) {
        const studentsByEmail = await db.collection("students").where("email", "==", email).get();
        for (const docSnap of studentsByEmail.docs) {
          await copyStudentNameToResults(docSnap.id, docSnap.data());
          await docSnap.ref.delete();
          deletedStudentCount++;
        }
      }

      await db.collection("users").doc(uid).delete();
      deletedUserCount++;

      await adminAuth.deleteUser(uid);
      deletedAuthCount++;
    }
  } while (nextPageToken);

  console.log("\nCleanup complete:");
  console.log(`  Deleted Auth users: ${deletedAuthCount}`);
  console.log(`  Deleted students docs: ${deletedStudentCount}`);
  console.log(`  Deleted users docs: ${deletedUserCount}`);
}

deleteAllExceptKeep()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  });
