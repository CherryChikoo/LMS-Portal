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

async function recreateAdmins() {
  const admins = [
    { email: "trainer@gmail.com", role: "admin", name: "Trainer Admin" },
    { email: "tallurisanju1@gmail.com", role: "admin", name: "Sanjus Admin" }
  ];
  
  for (const adminData of admins) {
    try {
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(adminData.email);
        console.log(`Found Auth user for ${adminData.email} with UID: ${userRecord.uid}`);
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          console.log(`Auth user missing for ${adminData.email}, creating...`);
          userRecord = await auth.createUser({
            email: adminData.email,
            password: "Welcome@123", // Set a default password if missing
            displayName: adminData.name,
          });
          console.log(`Created Auth user for ${adminData.email} with UID: ${userRecord.uid}`);
        } else {
          throw err;
        }
      }
      
      const docRef = db.collection("users").doc(userRecord.uid);
      await docRef.set({
        id: userRecord.uid,
        email: adminData.email,
        name: adminData.name,
        role: adminData.role,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });
      console.log(`Recreated Firestore user doc for ${adminData.email}`);
      
    } catch (e) {
      console.error(`Error processing ${adminData.email}:`, e);
    }
  }
}

recreateAdmins().catch(console.error);
