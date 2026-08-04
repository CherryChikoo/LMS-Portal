/**
 * URGENT: Restore trainer@gmail.com admin account
 * This script recreates the trainer account that was accidentally deleted
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin using environment variables
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const auth = admin.auth();
const db = admin.firestore();

async function restoreTrainerAccount() {
  const email = 'trainer@gmail.com';
  const password = 'Trainer@123'; // Change this to your desired password
  const displayName = 'Main Trainer';
  
  try {
    console.log('🔍 Checking if trainer@gmail.com exists...');
    
    // Check if account exists in Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('✅ Auth account exists:', userRecord.uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log('❌ Auth account NOT found. Creating new one...');
        
        // Create new auth account
        userRecord = await auth.createUser({
          email: email,
          password: password,
          displayName: displayName,
          emailVerified: true
        });
        
        console.log('✅ Created new Auth account:', userRecord.uid);
      } else {
        throw error;
      }
    }
    
    // Check if Firestore doc exists
    const userDocRef = db.collection('users').doc(userRecord.uid);
    const userDoc = await userDocRef.get();
    
    if (!userDoc.exists) {
      console.log('❌ Firestore doc NOT found. Creating...');
      
      // Create Firestore document
      await userDocRef.set({
        email: email,
        displayName: displayName,
        role: 'trainer',
        collegeId: '', // No specific college
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        emailVerified: true
      });
      
      console.log('✅ Created Firestore document');
    } else {
      console.log('✅ Firestore doc exists');
      
      // Update to ensure correct role
      await userDocRef.update({
        role: 'trainer',
        collegeId: '', // Clear any college assignment
        isActive: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ Updated Firestore document to trainer role');
    }
    
    console.log('\n🎉 SUCCESS! Trainer account restored:');
    console.log('   Email:', email);
    console.log('   UID:', userRecord.uid);
    console.log('   Password:', password);
    console.log('\n⚠️  IMPORTANT: Change the password after logging in!');
    console.log('   You can now login at your LMS portal');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

restoreTrainerAccount();
