const { getFirestore } = require('firebase-admin/firestore');
const { getAdminApp } = require('./src/lib/firebase/admin.js');

async function deleteCollege() {
  const db = getFirestore(getAdminApp());
  const collegeId = '9sdW0txAjevnyXUEfdGc';
  
  console.log('Deleting college:', collegeId);
  await db.collection('colleges').doc(collegeId).delete();
  console.log('Done!');
  process.exit(0);
}

deleteCollege().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
