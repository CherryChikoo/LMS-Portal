import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
  sendPasswordResetEmail,
  signInWithPopup,
  getIdToken,
  fetchSignInMethodsForEmail,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { googleProvider, signInWithGoogle } from "@/lib/firebase/auth";
import { getDocument, setDoc, doc, getDocuments, where } from "@/lib/firebase/firestore";
import { writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { setAuthSession, clearAuthSession } from "@/lib/utils/auth-session";
import { invalidateLMSCache } from "@/lib/data/lms-data-cache";
import type { User, UserRole, Student } from "@/types";

// Extended user type allows Firestore docs to carry extra fields (department, collegeId, etc.)
// while still satisfying the core User interface.
type ExtendedUser = User & Record<string, unknown>;

const USERS_COLLECTION = "users";
const STUDENTS_COLLECTION = "students";

function collegeNameToId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function verifyEmailRegistration(email: string): Promise<{
  exists: boolean;
  userDoc?: ExtendedUser | null;
  studentDoc?: Student | null;
  collegeDoc?: Record<string, any> | null;
}> {
  try {
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return { exists: false };
    return await res.json();
  } catch (err) {
    console.error("verifyEmailRegistration error:", err);
    return { exists: false };
  }
}



/**
 * Sign in Student via Google SSO popup.
 * Only succeeds if a student account already exists in Firestore (either a
 * `users/{uid}` doc or a `students` row matched by email). Brand-new Google
 * accounts are rejected and signed out so no records are created.
 */
export async function studentGoogleLogin(): Promise<
  | { success: true; role: UserRole; user: FirebaseUser; profile: User; isNewUser: boolean }
  | { success: true; role: "student"; user: FirebaseUser; profile: null; isNewUser: true }
> {
  const credential = await signInWithPopup(auth, googleProvider);
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();
  const name = credential.user.displayName || email.split("@")[0] || "Student";

  // Pre-flight validation via Admin SDK backend route
  const verifyResult = await verifyEmailRegistration(email);

  if (!verifyResult.exists) {
    // Immediately delete the automatically created Firebase Auth user so invalid accounts are never left in Firebase Auth
    try {
      await credential.user.delete();
    } catch {
      await firebaseSignOut(auth);
    }
    throw new Error(
      `Access Denied: The email address (${email}) is not registered in the system. Please contact your college administrator to get your account created.`
    );
  }

  const token = await getIdToken(credential.user, true);
  const userDoc = verifyResult.userDoc;
  const studentDoc = verifyResult.studentDoc;

  // Reject trainer/admin attempting to log in via the student portal.
  if (userDoc && (userDoc.role === "trainer" || userDoc.role === "admin")) {
    try {
      await credential.user.delete();
    } catch {
      await firebaseSignOut(auth).catch(() => {});
    }
    throw new Error("Trainers must log in via the /admin/login portal.");
  }

  if (userDoc?.status === "restricted" || studentDoc?.status === "restricted") {
    try {
      await credential.user.delete();
    } catch {
      await firebaseSignOut(auth).catch(() => {});
    }
    throw new Error("RESTRICTED_ACCOUNT: Your LMS account has been temporarily restricted by your Trainer/Admin. Please contact your Trainer for further assistance.");
  }

  if (userDoc?.isDeleted || userDoc?.status === "deleted" || studentDoc?.isDeleted || studentDoc?.status === "deleted") {
    try {
      await credential.user.delete();
    } catch {
      await firebaseSignOut(auth).catch(() => {});
    }
    throw new Error("ACCOUNT_DELETED: Your student account has been permanently deleted.");
  }

  const role: UserRole = (userDoc?.role as UserRole) || "student";

  const profile = {
    ...(userDoc || {}),
    ...(studentDoc || {}),
    id: uid,
    email: studentDoc?.email || userDoc?.email || email,
    displayName: studentDoc?.name || userDoc?.displayName || name,
    role,
    department: studentDoc?.department || userDoc?.department || "Computer Science & Engineering",
    collegeId: studentDoc?.collegeId || userDoc?.collegeId || "",
    collegeName: studentDoc?.collegeName || userDoc?.collegeName || "",
    academicYear: studentDoc?.academicYear || userDoc?.academicYear || null,
    section: studentDoc?.section || userDoc?.section || null,
    batchIds: studentDoc?.batchIds || userDoc?.batchIds || [],
    createdAt: userDoc?.createdAt || studentDoc?.createdAt || new Date(),
    updatedAt: new Date(),
  } as ExtendedUser;

  const cleanProfile = { ...profile } as Record<string, any>;
  Object.keys(cleanProfile).forEach(key => cleanProfile[key] === undefined && delete cleanProfile[key]);

  await setDoc(doc(db, USERS_COLLECTION, uid), cleanProfile, { merge: true });

  if (cleanProfile.collegeName) {
    // Asynchronously ensure the college is registered globally
    fetch("/api/auth/register-college", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collegeName: cleanProfile.collegeName })
    }).catch(() => {});
  }

  const sessionUser = {
    id: uid,
    name: profile.displayName,
    email: profile.email,
    role,
    department: profile.department || "Computer Science & Engineering",
    collegeId: profile.collegeId || "",
    collegeName: profile.collegeName || "",
    academicYear: profile.academicYear,
    section: profile.section,
    batchIds: profile.batchIds || [],
  };

  await setAuthSession(token, role, sessionUser);

  return { success: true, role, user: credential.user, profile, isNewUser: false };
}

/**
 * Sign up Student via Google SSO popup.
 */
export async function studentGoogleSignUp(): Promise<{ user: FirebaseUser; isNewUser: boolean }> {
  const credential = await signInWithGoogle();
  const email = (credential.user.email || "").toLowerCase().trim();

  const verifyResult = await verifyEmailRegistration(email);

  if (verifyResult.exists) {
    return { user: credential.user, isNewUser: false };
  }

  return { user: credential.user, isNewUser: true };
}

export async function trainerGoogleLogin(): Promise<{ success: true; role: UserRole; user: FirebaseUser; profile: User }> {
  const credential = await signInWithPopup(auth, googleProvider);
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();
  const name = credential.user.displayName || email.split("@")[0] || "Trainer";

  const verifyResult = await verifyEmailRegistration(email);

  if (!verifyResult.exists) {
    try {
      await credential.user.delete();
    } catch {
      await firebaseSignOut(auth);
    }
    throw new Error("Access Denied: This email is not registered as a Trainer/Admin. Please contact your administrator.");
  }

  const userDoc = verifyResult.userDoc;
  const role: UserRole = userDoc?.role === "admin" || userDoc?.role === "trainer" ? (userDoc.role as UserRole) : "trainer";

  if (userDoc?.isDeleted || userDoc?.status === "deleted") {
    await firebaseSignOut(auth);
    throw new Error("ACCOUNT_DELETED: Your trainer account has been permanently deleted.");
  }

  const token = await getIdToken(credential.user, true);

  const profile = {
    ...(userDoc || {}),
    id: uid,
    email: userDoc?.email || email,
    displayName: userDoc?.displayName || name,
    role,
    createdAt: userDoc?.createdAt || new Date(),
    updatedAt: new Date(),
  } as ExtendedUser;

  const cleanProfile = { ...profile } as Record<string, any>;
  Object.keys(cleanProfile).forEach(key => cleanProfile[key] === undefined && delete cleanProfile[key]);
  await setDoc(doc(db, USERS_COLLECTION, uid), cleanProfile, { merge: true });

  const sessionUser = {
    id: uid,
    name: profile.displayName,
    email: profile.email,
    role,
    department: profile.department || "Faculty Operations",
  };

  await setAuthSession(token, role, sessionUser);

  return { success: true, role, user: credential.user, profile };
}

/**
 * Update student password upon first login
 */
export async function updateFirstLoginPassword(newPassword: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("No authenticated user found.");

  await firebaseUpdatePassword(currentUser, newPassword);

  // Clear mustChangePassword flag in Firestore profile if present
  const profile = await getDocument<ExtendedUser>(USERS_COLLECTION, currentUser.uid);
  if (profile) {
    await setDoc(
      doc(db, USERS_COLLECTION, currentUser.uid),
      { ...profile, mustChangePassword: false, updatedAt: new Date() },
      { merge: true }
    );
    await setDoc(
      doc(db, STUDENTS_COLLECTION, currentUser.uid),
      { mustChangePassword: false, updatedAt: new Date() },
      { merge: true }
    );
  }
}

export async function logoutUser(): Promise<void> {
  // Clear LMS singleton cache
  invalidateLMSCache();
  
  // Clear client-side auth session (cookies, localStorage) and redirect first.
  // This guarantees that even if firebaseSignOut hangs or rejects, the user is
  // treated as logged out by the application and middleware on the next request.
  const redirectPromise = clearAuthSession();

  // Fire-and-forget Firebase sign-out so it cannot delay the redirect.
  firebaseSignOut(auth).catch(() => {});

  return redirectPromise;
}

export async function resetUserPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Register a new Student account (one account per email, email verification mandatory)
 * Password is stored securely in Firebase Auth ONLY. Never stored in Firestore database.
 */
export async function studentRegister(
  fullName: string,
  collegeEmail: string,
  password: string,
  collegeName: string,
  department: string = "Computer Science & Engineering",
  section: string = "A"
): Promise<{ user: FirebaseUser }> {
  if (!fullName || fullName.trim().length < 2) {
    throw new Error("Full Name must contain at least 2 characters.");
  }
  if (!/^[a-zA-Z\s\-.']+$/.test(fullName.trim())) {
    throw new Error("Full Name must contain only alphabetic characters, spaces, or hyphens.");
  }
  if (!collegeName || collegeName.trim().length < 3) {
    throw new Error("Please enter a valid College Name (at least 3 characters).");
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!collegeEmail || !emailRegex.test(collegeEmail.trim())) {
    throw new Error("Please provide a valid College Email ID.");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, collegeEmail.trim(), password);
  } catch (err: unknown) {
    const isEmailInUse = (err instanceof Error && err.message.includes("auth/email-already-in-use")) || (err as { code?: string })?.code === "auth/email-already-in-use";
    if (isEmailInUse) {
      throw new Error("An account with this College Email ID already exists. Please sign in instead.");
    } else {
      throw err;
    }
  }
  const uid = credential.user.uid;

  try {
    await updateProfile(credential.user, { displayName: fullName });
    await sendEmailVerification(credential.user).catch(() => {});

    const userDoc: User = {
      id: uid,
      email: collegeEmail.toLowerCase(),
      displayName: fullName,
      role: "student",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const studentDoc: Partial<Student> = {
      id: uid,
      name: fullName,
      email: collegeEmail.toLowerCase(),
      collegeName: collegeName,
      collegeId: collegeName,
      department: department || "Computer Science & Engineering",
      academicYear: "1st Year",
      semester: 1,
      section: section || "A",
      rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
      batchIds: ["BATCH-2026"],
      enrollmentType: "self",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, USERS_COLLECTION, uid), userDoc);
    batch.set(doc(db, STUDENTS_COLLECTION, uid), studentDoc);
    await batch.commit();

    // Asynchronously ensure the college is registered globally
    fetch("/api/auth/register-college", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collegeName })
    }).catch(() => {});

    return { user: credential.user };
  } catch (firestoreErr) {
    // ATOMIC ROLLBACK: Delete Firebase Auth user if Firestore document creation fails
    console.error("[ATOMIC ROLLBACK] Firestore creation failed. Rolling back Auth user...", firestoreErr);
    try {
      await credential.user.delete();
      await firebaseSignOut(auth);
    } catch (delErr) {
      console.error("[ATOMIC ROLLBACK] Failed to delete Auth user", delErr);
    }
    throw firestoreErr;
  }
}

/**
 * Post-registration step: Save complete academic details (Name, College Name, Department, Section).
 * Creates both users/{uid} and students/{uid} docs if they don't exist yet (Google sign-up flow),
 * or merges into existing docs (email/password flow).
 */
export async function completeStudentAcademicDetails(
  uid: string,
  details: {
    fullName: string;
    collegeName: string;
    department: string;
    section: string;
  }
): Promise<{ resolvedCollegeId: string; resolvedCollegeName: string }> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    await updateProfile(currentUser, { displayName: details.fullName });
  }

  const email = (currentUser?.email || "").toLowerCase().trim();
  const now = new Date();

  // Try to resolve the official college ID from the typed name
  let resolvedCollegeId = details.collegeName;
  let resolvedCollegeName = details.collegeName;

  try {
    const allCollegesResult = await getDocuments<{ id: string; name: string }>("colleges");
    const match = allCollegesResult.data.find(
      (c) => c.name.toLowerCase().trim() === details.collegeName.toLowerCase().trim()
    );
    if (match) {
      resolvedCollegeId = match.id;
      resolvedCollegeName = match.name;
    }
  } catch (err) {
    console.error("Failed to resolve college during registration:", err);
  }

  const userDoc = {
    id: uid,
    email,
    displayName: details.fullName,
    role: "student",
    collegeName: resolvedCollegeName,
    collegeId: resolvedCollegeId,
    department: details.department,
    section: details.section || "A",
    createdAt: now,
    updatedAt: now,
  };

  const studentDoc: Partial<Student> = {
    id: uid,
    name: details.fullName,
    email,
    collegeName: resolvedCollegeName,
    collegeId: resolvedCollegeId,
    department: details.department,
    section: details.section || "A",
    academicYear: "1st Year",
    semester: 1,
    rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
    batchIds: ["BATCH-2026"],
    enrollmentType: "self",
    createdAt: now,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, USERS_COLLECTION, uid), userDoc, { merge: true });
  batch.set(doc(db, STUDENTS_COLLECTION, uid), studentDoc, { merge: true });
  await batch.commit();

  if (resolvedCollegeName) {
    // Asynchronously ensure the college is registered globally
    fetch("/api/auth/register-college", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collegeName: resolvedCollegeName })
    }).catch(() => {});
  }
  
  return { resolvedCollegeId, resolvedCollegeName };
}

/**
 * Unified Login: Authenticates and dynamically determines user role
 */
export async function unifiedLogin(email: string, pass: string): Promise<{ user: FirebaseUser; profile: ExtendedUser | null; role: UserRole | string; mustChangePassword?: boolean }> {
  let credential;
  const cleanEmail = email.toLowerCase().trim();

  console.log(`[AUTH] unifiedLogin: Attempting login for email: ${cleanEmail}`);

  // Try authenticating first
  try {
    credential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
    console.log(`[AUTH] unifiedLogin: signInWithEmailAndPassword SUCCESS`);
  } catch (err: unknown) {
    console.log(`[AUTH] unifiedLogin: signInWithEmailAndPassword FAILED`, err);

    // Attempt password sync via Admin SDK if account is registered in Firestore
    let syncSuccess = false;
    try {
      const syncRes = await fetch("/api/auth/sync-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password: pass }),
      });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        if (syncData?.success) {
          credential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
          syncSuccess = true;
          console.log(`[AUTH] unifiedLogin: Password sync SUCCESS for ${cleanEmail}`);
        }
      }
    } catch (syncErr) {
      console.log(`[AUTH] unifiedLogin: Password sync error`, syncErr);
    }

    if (!syncSuccess) {
      // Fallback ONLY for the absolute master admin bootstrap
      if (cleanEmail === "trainer@gmail.com" && pass === "admin123456") {
        try {
          console.log(`[AUTH] unifiedLogin: Attempting master admin bootstrap creation...`);
          credential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        } catch (createErr) {
          console.error(`[AUTH] unifiedLogin: Master admin bootstrap failed.`, createErr);
          throw new Error("Invalid trainer credentials.");
        }
      } else {
        throw new Error("Invalid credentials or incorrect password.");
      }
    }
  }

  if (!credential || !credential.user) {
    throw new Error("Authentication failed.");
  }

  // Immediately refresh token to pull latest custom claims injected by Admin SDK
  await credential.user.getIdTokenResult(true);

  // If we reach here, signInWithEmailAndPassword succeeded. We have a UID.
  const uid = credential.user.uid;
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

  // If no profile by UID, try looking up by email (Legacy sync)
  if (!profile) {
    console.log(`[AUTH] unifiedLogin: No profile found by UID, searching by email...`);
    const existingUsersByEmail = await getDocuments<ExtendedUser>(USERS_COLLECTION, [where("email", "==", cleanEmail)]);
    if (existingUsersByEmail.data.length > 0) {
      profile = existingUsersByEmail.data[0];
      console.log(`[AUTH] unifiedLogin: Profile found by email. Role: ${profile.role}`);
      
      // SELF-HEALING: Write the profile to the correct UID so future logins don't fallback to email
      await setDoc(doc(db, USERS_COLLECTION, uid), profile);
      console.log(`[AUTH] unifiedLogin: Self-healed profile to correct UID ${uid}`);
    }
  }

  if (!profile) {
    if (cleanEmail === "trainer@gmail.com") {
      profile = {
        id: uid,
        email: cleanEmail,
        displayName: credential.user.displayName || "Super Administrator",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, USERS_COLLECTION, uid), profile);
      console.log(`[AUTH] unifiedLogin: Master admin profile created.`);
    } else {
      // Check if email matches a college admin email in colleges collection
      const colsByAdminEmail = await getDocuments<import("@/types").College>("colleges", [where("adminEmail", "==", cleanEmail)]);
      if (colsByAdminEmail.data.length > 0) {
        const col = colsByAdminEmail.data[0];
        profile = {
          id: uid,
          email: cleanEmail,
          displayName: col.name ? `${col.name.toLowerCase()} admin` : "College Administrator",
          role: "college_admin",
          collegeId: col.id,
          collegeName: col.name ? col.name.toLowerCase() : "",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ExtendedUser;
        await setDoc(doc(db, USERS_COLLECTION, uid), profile, { merge: true });
        console.log(`[AUTH] unifiedLogin: Recovered college_admin profile from college document.`);
      } else {
        // Fallback for legacy students who might only have a students doc
        let studentDoc = await getDocument<Student>("students", uid);
        if (!studentDoc) {
          const studsByEmail = await getDocuments<Student>("students", [where("email", "==", cleanEmail)]);
          if (studsByEmail.data.length > 0) {
            studentDoc = studsByEmail.data[0];
          }
        }

        if (studentDoc) {
          profile = {
            id: studentDoc.id || uid,
            email: studentDoc.email || credential.user.email || cleanEmail,
            displayName: studentDoc.name || "Student",
            role: "student",
            department: studentDoc.department || "Computer Science & Engineering",
            collegeId: studentDoc.collegeId || "",
            collegeName: studentDoc.collegeName || "",
            academicYear: studentDoc.academicYear || undefined,
            section: studentDoc.section || undefined,
            batchIds: studentDoc.batchIds || [],
            createdAt: studentDoc.createdAt || new Date(),
            updatedAt: studentDoc.updatedAt || new Date(),
          } as ExtendedUser;
          // Save user doc under Auth UID for fast future lookups
          await setDoc(doc(db, USERS_COLLECTION, uid), profile, { merge: true });
          console.log(`[AUTH] unifiedLogin: Recovered legacy student profile.`);
        } else {
          await firebaseSignOut(auth);
          console.error(`[AUTH] unifiedLogin: No Firestore profile found for authenticated user.`);
          throw new Error("Unauthorized: Account not found in directory.");
        }
      }
    }
  } else if (profile.role === "student") {
    let studentDoc = await getDocument<Student>("students", uid);
    if (!studentDoc) {
      const studsByEmail = await getDocuments<Student>("students", [where("email", "==", cleanEmail)]);
      if (studsByEmail.data.length > 0) {
        studentDoc = studsByEmail.data[0];
      }
    }
    if (studentDoc) {
      profile = {
        ...profile,
        id: studentDoc.id || uid,
        email: studentDoc.email || credential.user.email || cleanEmail,
        displayName: studentDoc.name || profile.displayName || "Student",
        department: studentDoc.department || profile.department || "Computer Science & Engineering",
        collegeId: studentDoc.collegeId || profile.collegeId || "",
        collegeName: studentDoc.collegeName || profile.collegeName || "",
        academicYear: studentDoc.academicYear || profile.academicYear,
        section: studentDoc.section || profile.section,
        batchIds: studentDoc.batchIds || profile.batchIds || [],
      };
    }
  }

  const role = profile.role;
  console.log(`[AUTH] unifiedLogin: Validation starting for role: ${role}`);

  // Validation
  if (role === "student") {
    let studentDoc = await getDocument<Student>("students", uid);
    if (!studentDoc) {
      const studsByEmail = await getDocuments<Student>("students", [where("email", "==", cleanEmail)]);
      if (studsByEmail.data.length > 0) studentDoc = studsByEmail.data[0];
    }
    if (profile?.status === "restricted" || studentDoc?.status === "restricted") {
      await firebaseSignOut(auth);
      throw new Error("RESTRICTED_ACCOUNT: Your LMS account has been temporarily restricted by your Trainer/Admin. Please contact your Trainer for further assistance.");
    }
    if (profile?.isDeleted || profile?.status === "deleted" || studentDoc?.isDeleted || studentDoc?.status === "deleted") {
      await firebaseSignOut(auth);
      throw new Error("ACCOUNT_DELETED: Your student account has been permanently deleted.");
    }
  } else if (role === "college_admin") {
    let collegeDoc: import("@/types").College | null = null;
    const targetColId = (profile as any).collegeId || "";
    const targetColName = (profile as any).collegeName || "";

    if (targetColId) {
      collegeDoc = await getDocument<import("@/types").College>("colleges", targetColId);
    }

    if (!collegeDoc && (targetColId || targetColName || profile.email)) {
      try {
        const allColsResult = await getDocuments<import("@/types").College>("colleges");
        const cleanSlug = (v?: string) => (v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "");
        const searchSlugId = cleanSlug(targetColId);
        const searchSlugName = cleanSlug(targetColName);
        const searchEmail = (profile.email || "").toLowerCase().trim();

        collegeDoc = allColsResult.data.find((c) => {
          if ((c.status as string) === "deleted" || c.isDeleted) return false;
          const cIdSlug = cleanSlug(c.id);
          const cNameSlug = cleanSlug(c.name);
          const cAdminEmail = (c.adminEmail || "").toLowerCase().trim();

          return (
            (searchSlugId && (cIdSlug === searchSlugId || cNameSlug === searchSlugId)) ||
            (searchSlugName && (cIdSlug === searchSlugName || cNameSlug === searchSlugName)) ||
            (searchEmail && cAdminEmail && searchEmail === cAdminEmail)
          );
        }) || null;
      } catch (_) {}
    }

    if (!collegeDoc) {
      console.error(`[AUTH] unifiedLogin: College doc not found for collegeId: ${targetColId}, collegeName: ${targetColName}`);
      await firebaseSignOut(auth);
      throw new Error("RESTRICTED_ACCOUNT: Your assigned college document could not be located.");
    }

    // Always bind and sync official collegeId and collegeName onto profile
    profile.collegeId = collegeDoc.id;
    profile.collegeName = collegeDoc.name ? collegeDoc.name.toLowerCase() : "";
    await setDoc(
      doc(db, USERS_COLLECTION, uid),
      { collegeId: collegeDoc.id, collegeName: collegeDoc.name ? collegeDoc.name.toLowerCase() : "" },
      { merge: true }
    );

    if (collegeDoc.status === "restricted") {
      await firebaseSignOut(auth);
      throw new Error("RESTRICTED_ACCOUNT: Your college dashboard access has been temporarily restricted by the administrator.");
    }
    if (collegeDoc.isDeleted || collegeDoc.status === "deleted" || profile.isDeleted || profile.status === "deleted") {
      await firebaseSignOut(auth);
      throw new Error("ACCOUNT_DELETED: This partner institution account has been permanently deleted.");
    }
  } else if (role === "trainer" || role === "admin") {
    if (profile.isDeleted || profile.status === "deleted") {
      await firebaseSignOut(auth);
      throw new Error("ACCOUNT_DELETED: Your trainer account has been permanently deleted.");
    }
  } else {
    await firebaseSignOut(auth);
    throw new Error("Unauthorized: Role not recognized.");
  }

  console.log(`[AUTH] unifiedLogin: SUCCESS.`);
  return { user: credential.user, profile, role, mustChangePassword: false };
}

/**
 * Unified Google Sign-In
 */
export async function unifiedGoogleLogin(): Promise<{ success: true; role: UserRole | string; user: FirebaseUser; profile: User }> {
  const credential = await signInWithGoogle();
  if (!credential || !credential.user) {
    throw new Error("Google Sign-In was cancelled.");
  }
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();
  const name = credential.user.displayName || email.split("@")[0] || "User";

  // Pre-flight validation via Admin SDK backend route
  const verifyResult = await verifyEmailRegistration(email);

  if (!verifyResult.exists) {
    try {
      await credential.user.delete();
    } catch {
      await firebaseSignOut(auth).catch(() => {});
    }
    throw new Error(`Access Denied: The email address (${email}) is not registered. Please create an account or contact your administrator.`);
  }

  const userDoc = verifyResult.userDoc;
  const studentDoc = verifyResult.studentDoc;
  const collegeDoc = verifyResult.collegeDoc;

  const role = userDoc?.role || (studentDoc ? "student" : (collegeDoc ? "college_admin" : "student"));

  if (role === "student") {
    if (userDoc?.status === "restricted" || studentDoc?.status === "restricted") {
      try {
        await credential.user.delete();
      } catch {
        await firebaseSignOut(auth).catch(() => {});
      }
      throw new Error("RESTRICTED_ACCOUNT: Your LMS account has been temporarily restricted.");
    }
    if (userDoc?.isDeleted || userDoc?.status === "deleted" || studentDoc?.isDeleted || studentDoc?.status === "deleted") {
      try {
        await credential.user.delete();
      } catch {
        await firebaseSignOut(auth).catch(() => {});
      }
      throw new Error("ACCOUNT_DELETED: Your student account has been permanently deleted.");
    }
  } else if (role === "college_admin") {
    if (collegeDoc?.loginEnabled === false || collegeDoc?.status === "restricted") {
      try {
        await credential.user.delete();
      } catch {
        await firebaseSignOut(auth).catch(() => {});
      }
      throw new Error("RESTRICTED_ACCOUNT: Your college dashboard access has been disabled.");
    }
    if (collegeDoc?.isDeleted || collegeDoc?.status === "deleted" || userDoc?.isDeleted || userDoc?.status === "deleted") {
      try {
        await credential.user.delete();
      } catch {
        await firebaseSignOut(auth).catch(() => {});
      }
      throw new Error("ACCOUNT_DELETED: This partner institution account has been permanently deleted.");
    }
  } else if (role === "trainer" || role === "admin") {
    if (userDoc?.isDeleted || userDoc?.status === "deleted") {
      try {
        await credential.user.delete();
      } catch {
        await firebaseSignOut(auth).catch(() => {});
      }
      throw new Error("ACCOUNT_DELETED: Your trainer account has been permanently deleted.");
    }
  }

  const token = await getIdToken(credential.user, true);

  const profile = {
    ...(userDoc || {}),
    ...(studentDoc || {}),
    id: uid,
    email: userDoc?.email || studentDoc?.email || email,
    displayName: userDoc?.displayName || studentDoc?.name || name,
    role,
    department: studentDoc?.department || userDoc?.department || "General",
    collegeId: studentDoc?.collegeId || userDoc?.collegeId || collegeDoc?.id || "",
    collegeName: studentDoc?.collegeName || userDoc?.collegeName || collegeDoc?.name || "",
    academicYear: studentDoc?.academicYear || userDoc?.academicYear || null,
    section: studentDoc?.section || userDoc?.section || null,
    batchIds: studentDoc?.batchIds || userDoc?.batchIds || [],
    createdAt: userDoc?.createdAt || studentDoc?.createdAt || new Date(),
    updatedAt: new Date(),
  } as ExtendedUser;

  const cleanProfile = { ...profile } as Record<string, any>;
  Object.keys(cleanProfile).forEach(key => cleanProfile[key] === undefined && delete cleanProfile[key]);
  await setDoc(doc(db, USERS_COLLECTION, uid), cleanProfile, { merge: true });

  const sessionUser = {
    id: uid,
    name: profile.displayName,
    email: profile.email,
    role,
    department: profile.department || "General",
    collegeId: profile.collegeId || "",
    collegeName: profile.collegeName || "",
  };

  await setAuthSession(token, role, sessionUser);

  return { success: true, role, user: credential.user, profile: profile as User };
}

/**
 * Converts Firebase authentication error codes and messages into clean, professional custom alert strings.
 */
export function formatAuthError(err: unknown, defaultMessage?: string): string {
  if (!err) return defaultMessage || "An unexpected authentication error occurred.";
  const msg = err instanceof Error ? err.message : String(err);
  
  if (msg.includes("RESTRICTED_ACCOUNT:")) {
    return msg.replace("RESTRICTED_ACCOUNT:", "").trim();
  }

  if (
    msg.includes("auth/user-not-found") ||
    msg.includes("user-not-found") ||
    msg.includes("no user record") ||
    msg.includes("user record") ||
    msg.includes("auth/invalid-credential") ||
    msg.includes("invalid-credential") ||
    msg.includes("auth/wrong-password") ||
    msg.includes("wrong-password")
  ) {
    return "Invalid credentials or no account exists with this email. Please check your credentials or contact your administrator.";
  }
  if (msg.includes("auth/email-already-in-use") || msg.includes("email-already-in-use") || msg.includes("already exists")) {
    return "An account with this email address already exists. Please try signing in instead.";
  }
  if (msg.includes("auth/weak-password") || msg.includes("weak-password")) {
    return "Password is too weak. Please choose a password with at least 6 characters.";
  }
  if (msg.includes("auth/invalid-email") || msg.includes("invalid-email")) {
    return "Please enter a valid academic email address.";
  }
  if (msg.includes("auth/too-many-requests") || msg.includes("too-many-requests")) {
    return "Too many unsuccessful attempts. Please wait a few minutes before trying again.";
  }
  if (msg.includes("auth/network-request-failed") || msg.includes("network-request-failed")) {
    return "Network connection error. Please check your internet connection and try again.";
  }
  if (msg.includes("auth/popup-closed-by-user") || msg.includes("popup-closed-by-user") || msg.includes("Cancelled by user")) {
    return "Sign-in popup was closed before completing authentication.";
  }
  if (msg.includes("auth/popup-blocked") || msg.includes("popup-blocked")) {
    return "Sign-in popup was blocked by your browser. Please allow popups for this site.";
  }
  if (msg.includes("auth/account-exists-with-different-credential") || msg.includes("account-exists-with-different-credential")) {
    return "An account already exists with the same email address but different sign-in credentials. Please sign in using your original method.";
  }
  if (msg.includes("auth/unauthorized-domain") || msg.includes("unauthorized-domain")) {
    return "This domain is not authorized for Google Sign-In. Please add this deployment URL to Firebase Console -> Authentication -> Settings -> Authorized domains.";
  }
  if (msg.includes("Google Sign-In")) {
    return msg.replace("Firebase: Error", "").replace(/\(auth\/.*?\)\.?/ig, "").trim();
  }

  if (msg.includes("Firebase: Error")) {
    const cleaned = msg.replace(/Firebase:\s*Error\s*\(.*?\)\.?/ig, "").trim();
    if (cleaned && cleaned !== ".") return cleaned;
    return defaultMessage || "Authentication failed. Please try again.";
  }
  
  if (msg.includes("Function setDoc() called with invalid data") || msg.includes("Unsupported field value: undefined")) {
    return "System synchronization failed due to incomplete data. Please try again or contact support.";
  }

  if (msg.toLowerCase().includes("delete") || msg.toLowerCase().includes("deletion")) {
    return "Failed to complete the removal process. Please try again or contact support.";
  }

  if (msg.toLowerCase().includes("firebase") || msg.toLowerCase().includes("database") || msg.toLowerCase().includes("firestore")) {
    return defaultMessage || "An unexpected system error occurred. Please try again.";
  }

  return msg || defaultMessage || "An unexpected error occurred.";
}
