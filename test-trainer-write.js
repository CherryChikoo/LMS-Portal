const { initializeApp } = require("firebase/app");
const { getAuth, signInWithCustomToken } = require("firebase/auth");
const { getFirestore, collection, addDoc } = require("firebase/firestore");
const admin = require("firebase-admin");
require("dotenv").config({ path: ".env.local" });

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
  })
});

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function testWrite() {
  try {
    const uid = "uqVuRAxMOSWlrr2dIdjdboKKHr43"; // Trainer
    const customToken = await admin.auth().createCustomToken(uid);
    await signInWithCustomToken(auth, customToken);
    
    console.log("Logged in as Trainer");
    
    const docRef = await addDoc(collection(db, "colleges"), {
      name: "test college",
      status: "active"
    });
    console.log("Successfully created college:", docRef.id);
    
    // Cleanup
    await admin.firestore().collection("colleges").doc(docRef.id).delete();
    console.log("Cleaned up");
    process.exit(0);
  } catch (error) {
    console.error("Failed to write:", error.message);
    process.exit(1);
  }
}

testWrite();
