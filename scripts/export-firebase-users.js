require("dotenv").config({ path: ".env.local" });
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const fs = require("fs");
const path = require("path");

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

async function exportUsers() {
  console.log("Fetching users from Firebase Auth...");
  const auth = getAuth();
  let allUsers = [];
  let pageToken;

  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(listUsersResult.users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  console.log(`Found ${allUsers.length} users. Formatting for Supabase...`);

  const supabaseFormat = {
    users: allUsers.map(user => {
      return {
        localId: user.uid,
        email: user.email,
        emailVerified: user.emailVerified || false,
        passwordHash: user.passwordHash ? user.passwordHash.toString("base64") : undefined,
        salt: user.passwordSalt ? user.passwordSalt.toString("base64") : undefined,
        displayName: user.displayName || "",
        createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).getTime().toString() : Date.now().toString(),
        lastSignedInAt: user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).getTime().toString() : Date.now().toString(),
        providerUserInfo: (user.providerData || []).map(p => ({
          providerId: p.providerId,
          rawId: p.uid,
          email: p.email,
          displayName: p.displayName
        }))
      };
    })
  };

  const outputPath = path.join(__dirname, "..", "firebase_users.json");
  fs.writeFileSync(outputPath, JSON.stringify(supabaseFormat, null, 2));
  console.log(`Successfully exported ${allUsers.length} users to ${outputPath}`);
}

exportUsers().catch(console.error);
