const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const path = require("path");
const dotenv = require("dotenv");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env.local") });

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY
        ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
        : undefined,
    }),
  });
}

const db = getFirestore();
const auth = getAuth();

async function checkUsers() {
  console.log("Checking users collection in Firestore...");
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} user documents in Firestore.`);
  
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    console.log(`\nFirestore Doc ID: ${doc.id}`);
    console.log(`  Role: ${data.role}`);
    console.log(`  Email: ${data.email}`);
    
    // Check if this uid exists in Auth
    try {
      const authUser = await auth.getUser(doc.id);
      console.log(`  Auth Record FOUND: ${authUser.email}`);
    } catch (e) {
      console.log(`  Auth Record MISSING: ${e.code}`);
    }
  }
  
  console.log("\nChecking Auth users in Firebase Auth...");
  const listUsersResult = await auth.listUsers(100);
  console.log(`Found ${listUsersResult.users.length} users in Firebase Auth.`);
  
  for (const user of listUsersResult.users) {
    console.log(`\nAuth UID: ${user.uid}`);
    console.log(`  Email: ${user.email}`);
    
    // Check if this uid exists in Firestore
    const docSnap = await db.collection("users").doc(user.uid).get();
    if (docSnap.exists) {
      console.log(`  Firestore Doc FOUND: Role=${docSnap.data().role}`);
    } else {
      console.log(`  Firestore Doc MISSING`);
    }
  }
}

checkUsers().catch(console.error);
