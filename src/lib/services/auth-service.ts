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



/**
 * Sign in Student via Google SSO popup.
 * Only succeeds if a student account already exists in Firestore (either a
 * `users/{uid}` doc or a `students` row matched by email). Brand-new Google
 * accounts are rejected and signed out so no records are created.
 */
export async function studentGoogleLogin(): Promise<{ success: true; role: UserRole; user: FirebaseUser; profile: User }> {
  const credential = await signInWithPopup(auth, googleProvider);
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();
  const name = credential.user.displayName || email.split("@")[0] || "Student";

  const token = await getIdToken(credential.user, true);
  const studDocs = await getDocuments<Student>(STUDENTS_COLLECTION, [where("email", "==", email)]);
  const existingUsersByEmail = await getDocuments<ExtendedUser>(USERS_COLLECTION, [where("email", "==", email)]);

  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

  // If no direct profile doc for this Google UID, check if an existing user doc exists by email (dual-identity resolution)
  if (!profile && existingUsersByEmail.length > 0) {
    const matchedUser = existingUsersByEmail[0];
    profile = {
      ...matchedUser,
      id: uid,
      updatedAt: new Date(),
    };
  }

  // Reject if neither a users doc nor a students doc exists for this Google identity.
  if (!profile && studDocs.length === 0) {
    await firebaseSignOut(auth);
    throw new Error(
      "No student account found for this Google email. Please create a student account first. If you don't have a Google account, create one at google.com and then use the Register page."
    );
  }

  // Reject trainer/admin attempting to log in via the student portal.
  if (profile && (profile.role === "trainer" || profile.role === "admin")) {
    await firebaseSignOut(auth);
    throw new Error("Trainers must log in via the /admin/login portal.");
  }

  if (profile?.status === "restricted" || studDocs[0]?.status === "restricted" || (existingUsersByEmail[0] as unknown as { status?: string })?.status === "restricted") {
    await firebaseSignOut(auth);
    throw new Error("RESTRICTED_ACCOUNT: Your LMS account has been temporarily restricted by your Trainer/Admin. Please contact your Trainer for further assistance.");
  }

  if (profile?.isDeleted || profile?.status === "deleted" || studDocs[0]?.isDeleted || studDocs[0]?.status === "deleted" || (existingUsersByEmail[0] as unknown as { isDeleted?: boolean })?.isDeleted) {
    await firebaseSignOut(auth);
    throw new Error("ACCOUNT_DELETED: Your student account has been permanently deleted.");
  }

  const role: UserRole = profile?.role || "student";

  // If a students doc or existing user doc exists, merge academic profile into users/{uid} and allow login.
  if (studDocs.length > 0 || existingUsersByEmail.length > 0) {
    const s = studDocs[0] || ({} as Student);
    const existing: Record<string, any> = profile || existingUsersByEmail[0] || {};
    profile = {
      ...(existing || {}),
      id: uid,
      email: s.email || existing.email || email,
      displayName: s.name || existing.displayName || name,
      role,
      department: s.department || existing.department || "Computer Science & Engineering",
      collegeId: s.collegeId || existing.collegeId || "",
      collegeName: s.collegeName || existing.collegeName || "",
      academicYear: s.academicYear || existing.academicYear || null,
      section: s.section || existing.section || null,
      batchIds: s.batchIds || existing.batchIds || [],
      createdAt: existing.createdAt || new Date(),
      updatedAt: new Date(),
    } as ExtendedUser;

    // Remove any remaining undefined fields to prevent Firestore setDoc errors
    const cleanProfile = { ...profile } as Record<string, any>;
    Object.keys(cleanProfile).forEach(key => cleanProfile[key] === undefined && delete cleanProfile[key]);

    await setDoc(doc(db, USERS_COLLECTION, uid), cleanProfile, { merge: true });
  }

  const sessionUser = {
    id: uid,
    name: profile!.displayName,
    email: profile!.email,
    role,
    department: profile?.department || "Computer Science & Engineering",
    collegeId: profile?.collegeId || "",
    collegeName: profile?.collegeName || "",
    academicYear: profile?.academicYear,
    section: profile?.section,
    batchIds: profile?.batchIds || [],
  };

  await setAuthSession(token, role, sessionUser);

  return { success: true, role, user: credential.user, profile: profile! };
}

/**
 * Sign up Student via Google SSO popup.
 * Rejects if the Google email/UID is already associated with an account;
 * otherwise returns the authenticated user so the register page can continue
 * to the academic-details step. No Firestore docs are written here — they are
 * created only when the student completes the final submission via
 * completeStudentAcademicDetails().
 */
export async function studentGoogleSignUp(): Promise<{ user: FirebaseUser }> {
  const credential = await signInWithGoogle();
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();

  const existingProfile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);
  const studDocs = await getDocuments<Student>(STUDENTS_COLLECTION, [where("email", "==", email)]);

  if (existingProfile || studDocs.length > 0) {
    await firebaseSignOut(auth);
    throw new Error("An account with this email already exists. Please sign in instead.");
  }

  // Do NOT write to Firestore yet — let completeStudentAcademicDetails()
  // create the docs only when the student finishes the registration form.
  return { user: credential.user };
}

/**
 * Sign in Trainer/Admin via Google SSO popup.
 * Existing users keep their stored role; brand-new users are bootstrapped
 * with a trainer users doc.
 */
export async function trainerGoogleLogin(): Promise<{ success: true; role: UserRole; user: FirebaseUser; profile: User }> {
  const credential = await signInWithPopup(auth, googleProvider);
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();
  const name = credential.user.displayName || email.split("@")[0] || "Trainer";

  const token = await getIdToken(credential.user, true);
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

  if (!profile) {
    profile = {
      id: uid,
      email,
      displayName: name,
      role: "trainer",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ExtendedUser;
    await setDoc(doc(db, USERS_COLLECTION, uid), profile);
  }

  const role: UserRole = profile.role === "admin" || profile.role === "trainer" ? profile.role : "trainer";

  const sessionUser = {
    id: uid,
    name: profile.displayName,
    email: profile.email,
    role,
    department: profile?.department || "Faculty Operations",
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
  collegeName: string
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

  await updateProfile(credential.user, { displayName: fullName });
  await sendEmailVerification(credential.user);

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
    department: "General",
    academicYear: "1st Year",
    semester: 1,
    section: "A",
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

  return { user: credential.user };
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
    const allColleges = await getDocuments<{ id: string; name: string }>("colleges");
    const match = allColleges.find(
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
      // For everyone else, failure is failure. 
      // Do a quick check if they used Google SSO previously to give a better error message.
      try {
        const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
        if (methods.includes("google.com") && !methods.includes("password")) {
          throw new Error("This account was authenticated using Google Sign-In. To log in right now, please click 'Sign in with Google' above.");
        }
      } catch (methodErr: unknown) {
        if (methodErr instanceof Error && methodErr.message.includes("Google Sign-In")) {
          throw methodErr;
        }
      }
      
      throw new Error("Invalid credentials or incorrect password.");
    }
  }

  // If we reach here, signInWithEmailAndPassword succeeded. We have a UID.
  const uid = credential.user.uid;
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

  // If no profile by UID, try looking up by email (Legacy sync)
  if (!profile) {
    console.log(`[AUTH] unifiedLogin: No profile found by UID, searching by email...`);
    const existingUsersByEmail = await getDocuments<ExtendedUser>(USERS_COLLECTION, [where("email", "==", cleanEmail)]);
    if (existingUsersByEmail.length > 0) {
      profile = existingUsersByEmail[0];
      console.log(`[AUTH] unifiedLogin: Profile found by email. Role: ${profile.role}`);
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
      // Fallback for legacy students who might only have a students doc
      let studentDoc = await getDocument<Student>("students", uid);
      if (!studentDoc) {
        const studsByEmail = await getDocuments<Student>("students", [where("email", "==", cleanEmail)]);
        if (studsByEmail.length > 0) {
          studentDoc = studsByEmail[0];
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
  } else if (profile.role === "student") {
    let studentDoc = await getDocument<Student>("students", uid);
    if (!studentDoc) {
      const studsByEmail = await getDocuments<Student>("students", [where("email", "==", cleanEmail)]);
      if (studsByEmail.length > 0) {
        studentDoc = studsByEmail[0];
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
      if (studsByEmail.length > 0) studentDoc = studsByEmail[0];
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
    const collegeDoc = await getDocument<import("@/types").College>("colleges", (profile as any).collegeId || "");
    if (!collegeDoc) {
      console.error(`[AUTH] unifiedLogin: College doc not found for collegeId: ${(profile as any).collegeId}`);
      await firebaseSignOut(auth);
      throw new Error("RESTRICTED_ACCOUNT: Your assigned college could not be found.");
    }
    if (collegeDoc.loginEnabled === false || collegeDoc.status === "restricted") {
      await firebaseSignOut(auth);
      throw new Error("RESTRICTED_ACCOUNT: Your college dashboard access has been disabled by the main administrator.");
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
export async function unifiedGoogleLogin(): Promise<{ success: true; role: UserRole | string; user: FirebaseUser; profile: User } | null> {
  const credential = await signInWithGoogle();
  if (!credential || !credential.user) {
    return null;
  }
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();
  const name = credential.user.displayName || email.split("@")[0] || "User";

  const token = await getIdToken(credential.user, true);
  
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);
  const existingUsersByEmail = await getDocuments<ExtendedUser>(USERS_COLLECTION, [where("email", "==", email)]);

  if (!profile && existingUsersByEmail.length > 0) {
    const matchedUser = existingUsersByEmail[0];
    profile = {
      ...matchedUser,
      id: uid,
      updatedAt: new Date(),
    };
  }

  let role = profile?.role;
  let isStudent = false;

  if (!profile) {
    // Check if they are a student via email
    const studDocs = await getDocuments<Student>(STUDENTS_COLLECTION, [where("email", "==", email)]);
    if (studDocs.length > 0) {
      role = "student";
      isStudent = true;
      const s = studDocs[0];
      profile = {
        id: uid,
        email: s.email || email,
        displayName: s.name || name,
        role,
        department: s.department || "Computer Science & Engineering",
        collegeId: s.collegeId || "",
        collegeName: s.collegeName || "",
        academicYear: s.academicYear || null,
        section: s.section || null,
        batchIds: s.batchIds || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ExtendedUser;
      await setDoc(doc(db, USERS_COLLECTION, uid), profile, { merge: true });
    } else {
      await firebaseSignOut(auth);
      throw new Error(
        "No account found for this Google email. Please register first."
      );
    }
  }

  if (!role) role = profile.role || "student";
  
  if (role === "student") {
    let studDocs = await getDocuments<Student>(STUDENTS_COLLECTION, [where("email", "==", email)]);
    
    // Auto-create basic student doc if they skipped registration step 2
    if (studDocs.length === 0) {
      const newStudentDoc: Partial<Student> = {
        id: uid,
        name: profile?.displayName || name || email.split("@")[0],
        email: email,
        collegeName: "Not Specified",
        collegeId: "",
        department: "General",
        academicYear: "1st Year",
        semester: 1,
        section: "A",
        rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
        batchIds: [],
        enrollmentType: "self",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, STUDENTS_COLLECTION, uid), newStudentDoc);
      studDocs = [newStudentDoc as Student];
    }

    const s = studDocs[0] || ({} as Student);
    profile = {
      ...profile,
      department: s.department || profile.department || "Computer Science & Engineering",
      collegeId: s.collegeId || profile.collegeId || "",
      collegeName: s.collegeName || profile.collegeName || "",
      academicYear: s.academicYear || profile.academicYear || null,
      section: s.section || profile.section || null,
      batchIds: s.batchIds || profile.batchIds || [],
    } as ExtendedUser;
    
    // Remove undefined fields
    const cleanProfile = { ...profile } as Record<string, any>;
    Object.keys(cleanProfile).forEach(key => cleanProfile[key] === undefined && delete cleanProfile[key]);
    await setDoc(doc(db, USERS_COLLECTION, uid), cleanProfile, { merge: true });
  }

  // Validate
  if (role === "student") {
    const studentDoc = await getDocument<Student>("students", uid) || (await getDocuments<Student>(STUDENTS_COLLECTION, [where("email", "==", email)]))[0];
    if (profile?.status === "restricted" || studentDoc?.status === "restricted") {
      await firebaseSignOut(auth);
      throw new Error("RESTRICTED_ACCOUNT: Your LMS account has been temporarily restricted.");
    }
    if (profile?.isDeleted || profile?.status === "deleted" || studentDoc?.isDeleted || studentDoc?.status === "deleted") {
      await firebaseSignOut(auth);
      throw new Error("ACCOUNT_DELETED: Your student account has been permanently deleted.");
    }
  } else if (role === "college_admin") {
    const collegeDoc = await getDocument<import("@/types").College>("colleges", (profile as any).collegeId || "");
    if (!collegeDoc || collegeDoc.loginEnabled === false || collegeDoc.status === "restricted") {
      await firebaseSignOut(auth);
      throw new Error("RESTRICTED_ACCOUNT: Your college dashboard access has been disabled.");
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
  }

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

  if (msg.includes("auth/user-not-found") || msg.includes("user-not-found") || msg.includes("auth/invalid-credential") || msg.includes("invalid-credential") || msg.includes("auth/wrong-password") || msg.includes("wrong-password")) {
    return "Invalid credentials. If no account exists, please contact your administrator or sign up to create one.";
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
    return "Database synchronization failed due to incomplete data. Please try again or contact support.";
  }

  return msg || defaultMessage || "An unexpected error occurred.";
}
