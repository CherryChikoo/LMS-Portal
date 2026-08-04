# URGENT: Restore trainer@gmail.com Account

## What Happened
The trainer@gmail.com admin account was accidentally deleted during a college deletion operation. This was caused by a bug where the deletion logic didn't protect admin/trainer/superadmin roles.

## Bug Fixed
✅ Updated `src/app/api/admin/delete-college/route.ts` to NEVER delete:
- main_admin
- admin
- trainer
- superadmin

Only `college_admin` and `student` roles can now be deleted.

---

## Option 1: Manual Restore via Firebase Console (EASIEST)

### Step 1: Go to Firebase Console
1. Open https://console.firebase.google.com
2. Select project: `lms-portal-ba7b0`
3. Go to **Authentication** → **Users**

### Step 2: Add User
Click "Add user" and enter:
- **Email:** `trainer@gmail.com`
- **Password:** `Trainer@123` (or your preferred password)
- Click "Add user"

### Step 3: Get the UID
- Copy the **UID** of the newly created user (looks like: `abc123xyz...`)

### Step 4: Add Firestore Document
1. Go to **Firestore Database**
2. Navigate to **users** collection
3. Click "Add document"
4. Document ID: Paste the UID from step 3
5. Add these fields:

```
email: "trainer@gmail.com"
displayName: "Main Trainer"
role: "trainer"
collegeId: ""
isActive: true
emailVerified: true
createdAt: (current timestamp)
updatedAt: (current timestamp)
```

6. Click "Save"

### Step 5: Test Login
Go to your LMS portal and login with:
- Email: `trainer@gmail.com`
- Password: `Trainer@123` (or what you set)

---

## Option 2: Using Firebase CLI

```powershell
# Create auth account
firebase auth:import trainer-restore.json --project lms-portal-ba7b0

# Then manually add Firestore document via console (step 4 above)
```

Create `trainer-restore.json`:
```json
[
  {
    "uid": "generate-new-uid-here",
    "email": "trainer@gmail.com",
    "emailVerified": true,
    "passwordHash": "base64-encoded-hash",
    "displayName": "Main Trainer"
  }
]
```

---

## Option 3: Using Node Script (Advanced)

If you have the Firebase Admin SDK credentials:

```javascript
const admin = require('firebase-admin');
admin.initializeApp();

async function restore() {
  // Create auth account
  const user = await admin.auth().createUser({
    email: 'trainer@gmail.com',
    password: 'Trainer@123',
    displayName: 'Main Trainer',
    emailVerified: true
  });
  
  // Create Firestore doc
  await admin.firestore().collection('users').doc(user.uid).set({
    email: 'trainer@gmail.com',
    displayName: 'Main Trainer',
    role: 'trainer',
    collegeId: '',
    isActive: true,
    emailVerified: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  console.log('✅ Restored:', user.uid);
}

restore();
```

---

## Verification

After restoration, verify:
1. ✅ Can login at https://your-lms-portal.vercel.app/login
2. ✅ Role shows as "trainer" in the UI
3. ✅ Can access admin features (colleges, exams, students)
4. ✅ Firestore document exists in `users/{uid}` with `role: "trainer"`

---

## Prevention

The bug is now FIXED in the code:

**Before (BAD):**
```typescript
// Deleted ALL users with matching collegeId
usersSnap.docs.forEach(doc => authUidsToDelete.add(doc.id));
```

**After (GOOD):**
```typescript
// Only delete college_admin and student roles
usersSnap.docs.forEach(doc => {
  const role = doc.data()?.role;
  if (role === 'college_admin' || role === 'student' || !role) {
    authUidsToDelete.add(doc.id);
  } else {
    console.log(`Skipping protected role: ${role}`);
  }
});
```

---

## Next Steps

1. ✅ **Fix Applied:** Bug is fixed in code
2. ⏳ **Restore Account:** Use Option 1 above (easiest)
3. ✅ **Build Passes:** Code compiles successfully
4. 🚀 **Deploy:** Ready to deploy fixed version

---

## Summary

- **Root Cause:** Delete logic didn't protect admin roles
- **Fix:** Added role protection (never delete admin/trainer/superadmin)
- **Restore:** Use Firebase Console (Option 1) - takes 2 minutes
- **Status:** Code fixed, ready for deployment

**Recommended:** Use Option 1 (Firebase Console) - it's the fastest and safest method!
