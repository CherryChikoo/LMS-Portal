const admin = require('firebase-admin');
const path = require('path');

// Try to initialize using the credentials from the project's .env.local
const envConfig = require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Fix for newline characters in the private key
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })
});

async function run() {
  const db = admin.firestore();
  
  console.log("Checking college admins...");
  const users = await db.collection('users').where('role', '==', 'college_admin').get();
  console.log(`Found ${users.size} college admins.`);
  users.forEach(doc => {
    console.log(doc.id, doc.data());
  });
  
  console.log("\nChecking colleges...");
  const colleges = await db.collection('colleges').get();
  console.log(`Found ${colleges.size} colleges.`);
  colleges.forEach(doc => {
    console.log(doc.id, doc.data().name);
  });
  
  console.log("\nChecking settings/branding...");
  const brand = await db.collection('settings').doc('branding').get();
  if (brand.exists) {
    console.log("branding:", brand.data());
  } else {
    console.log("branding document does not exist");
  }
}

run().catch(console.error);
