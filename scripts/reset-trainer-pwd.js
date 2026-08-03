const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
require('dotenv').config({ path: '.env.local' });

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

async function resetPassword() {
  try {
    const email = 'trainer@gmail.com';
    const newPassword = 'admin@123';
    const user = await getAuth().getUserByEmail(email);
    await getAuth().updateUser(user.uid, { password: newPassword });
    console.log('Successfully updated password for ' + email);
  } catch (error) {
    console.error('Error updating password:', error);
  } finally {
    process.exit(0);
  }
}

resetPassword();