/**
 * Delete the orphaned college document for test@gmail.com
 */

const admin = require('firebase-admin');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = getFirestore();

async function deleteOrphanedCollege() {
  const collegeId = '9sdW0txAjevnyXUEfdGc';
  const email = 'test@gmail.com';
  
  console.log(`\n🔍 Looking for orphaned college: ${collegeId}`);
  
  try {
    // Check if college exists
    const collegeDoc = await db.collection('colleges').doc(collegeId).get();
    
    if (!collegeDoc.exists) {
      console.log(`✅ College ${collegeId} doesn't exist - already deleted!`);
      process.exit(0);
    }
    
    const data = collegeDoc.data();
    console.log(`\n📋 Found college:`, {
      id: collegeId,
      name: data.name,
      adminEmail: data.adminEmail,
      status: data.status,
      isDeleted: data.isDeleted,
      createdAt: data.createdAt?.toDate?.()
    });
    
    if (data.adminEmail !== email) {
      console.log(`\n⚠️  Warning: Email mismatch!`);
      console.log(`   Expected: ${email}`);
      console.log(`   Found: ${data.adminEmail}`);
      console.log(`\n❌ Aborting - email doesn't match!`);
      process.exit(1);
    }
    
    // Delete the college document
    console.log(`\n🗑️  Deleting college ${collegeId}...`);
    await db.collection('colleges').doc(collegeId).delete();
    console.log(`✅ College document deleted successfully!`);
    
    // Check for associated user in users collection
    console.log(`\n🔍 Checking for associated user with email ${email}...`);
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .get();
    
    if (usersSnapshot.empty) {
      console.log(`✅ No user found with email ${email}`);
    } else {
      console.log(`\n📋 Found ${usersSnapshot.size} user(s):`);
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        console.log(`  - ${doc.id}: role=${userData.role}, collegeId=${userData.collegeId}`);
      });
      
      console.log(`\n🗑️  Deleting associated users...`);
      const batch = db.batch();
      usersSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`✅ Deleted ${usersSnapshot.size} user(s)`);
    }
    
    // Check Firebase Auth
    console.log(`\n🔍 Checking Firebase Auth for ${email}...`);
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      console.log(`\n📋 Found Auth user:`, {
        uid: authUser.uid,
        email: authUser.email,
        disabled: authUser.disabled
      });
      
      console.log(`\n🗑️  Deleting Auth user ${authUser.uid}...`);
      await admin.auth().deleteUser(authUser.uid);
      console.log(`✅ Auth user deleted successfully!`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`✅ No Auth user found with email ${email}`);
      } else {
        console.error(`❌ Error checking Auth:`, err.message);
      }
    }
    
    console.log(`\n🎉 CLEANUP COMPLETE!`);
    console.log(`\nYou can now create a college with ${email}\n`);
    
  } catch (error) {
    console.error(`\n❌ Error:`, error);
    process.exit(1);
  }
  
  process.exit(0);
}

deleteOrphanedCollege();
