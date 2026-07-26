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
 * Sign in Trainer/Admin and verify role
 */
export async function trainerLogin(email: string, pass: string): Promise<{ user: FirebaseUser; profile: User }> {
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, email, pass);
  } catch (_err: unknown) {
    // If account doesn't exist yet in Firebase Auth, only bootstrap if exact default master credentials match
    if (
      email.toLowerCase() === "trainer@gmail.com" && pass === "admin123456"
    ) {
      try {
        credential = await createUserWithEmailAndPassword(auth, email, pass);
      } catch {
        throw new Error("Invalid trainer credentials or account already exists with a different password.");
      }
    } else {
      try {
        const methods = await fetchSignInMethodsForEmail(auth, email.toLowerCase().trim());
        if (methods.includes("google.com") && !methods.includes("password")) {
          throw new Error("This account was authenticated using Google Sign-In. To log in right now, please click 'Sign in with Google' above. (Admin tip: To allow simultaneous Email/Password and Google login without provider overwriting, enable 'Allow multiple accounts with the same email address' in Firebase Console -> Authentication -> Settings -> User account linking).");
        }
      } catch (methodErr: unknown) {
        if (methodErr instanceof Error && methodErr.message.includes("Google Sign-In")) {
          throw methodErr;
        }
      }
      throw new Error("Invalid administrative credentials. Please check your email and password.");
    }
  }
  const uid = credential.user.uid;
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

  // If initial bootstrap admin (e.g. first login or trainer account creation)
  if (!profile) {
    if (email.toLowerCase() === "trainer@gmail.com") {
      profile = {
        id: uid,
        email: email.toLowerCase(),
        displayName: credential.user.displayName || "Super Administrator",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, USERS_COLLECTION, uid), profile);
    } else {
      await firebaseSignOut(auth);
      throw new Error("Unauthorized: Access restricted to authorized faculty and trainer accounts.");
    }
  } else if (profile.role !== "trainer" && profile.role !== "admin") {
    await firebaseSignOut(auth);
    throw new Error("Unauthorized: You do not have trainer or administrator privileges.");
  } else if (profile.isDeleted || profile.status === "deleted") {
    await firebaseSignOut(auth);
    throw new Error("ACCOUNT_DELETED: Your trainer account has been permanently deleted.");
  }

  return { user: credential.user, profile };
}

/**
 * Sign in College Admin and verify role/credentials
 */
export async function collegeAdminLogin(email: string, pass: string): Promise<{ user: FirebaseUser; profile: ExtendedUser }> {
  let credential;
  const cleanEmail = email.toLowerCase().trim();
  try {
    credential = await signInWithEmailAndPassword(auth, email, pass);
  } catch (_err: unknown) {
    // Check if college admin exists in Firestore
    const docs = await getDocuments<import("@/types").College>("colleges", [where("adminEmail", "==", cleanEmail)]);
    if (docs.length > 0) {
      const college = docs[0];
      if (college.initialPassword === pass && college.loginEnabled !== false) {
        try {
          credential = await createUserWithEmailAndPassword(auth, email, pass);
          await updateProfile(credential.user, { displayName: `${college.name} Admin` });
        } catch {
          // The Auth account may already exist; try signing in with the same password
          credential = await signInWithEmailAndPassword(auth, email, pass);
        }
        const newUid = credential.user.uid;

        // Ensure user doc is created
        const newUserDoc: Record<string, unknown> = {
          id: newUid,
          email: cleanEmail,
          displayName: `${college.name} Admin`,
          role: "college_admin",
          collegeId: college.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await setDoc(doc(db, USERS_COLLECTION, newUid), newUserDoc);

        return {
          user: credential.user,
          profile: newUserDoc as unknown as ExtendedUser,
        };
      }
    }
    throw new Error("Invalid college admin credentials or incorrect password.");
  }

  const uid = credential.user.uid;
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);
  
  if (!profile || profile.role !== "college_admin") {
    await firebaseSignOut(auth);
    throw new Error("Unauthorized: You do not have college admin privileges.");
  }

  // Ensure their college hasn't been restricted/disabled
  const collegeDoc = await getDocument<import("@/types").College>("colleges", (profile as any).collegeId || "");
  if (!collegeDoc || collegeDoc.loginEnabled === false || collegeDoc.status === "restricted") {
    await firebaseSignOut(auth);
    throw new Error("RESTRICTED_ACCOUNT: Your college dashboard access has been disabled by the main administrator.");
  }
  
  if (collegeDoc.isDeleted || collegeDoc.status === "deleted" || profile.isDeleted || profile.status === "deleted") {
    await firebaseSignOut(auth);
    throw new Error("ACCOUNT_DELETED: This partner institution account has been permanently deleted.");
  }

  return { user: credential.user, profile };
}

/**
 * Sign in Student and check if first login password change is required
 */
export async function studentLogin(email: string, pass: string): Promise<{ user: FirebaseUser; profile: ExtendedUser | null; mustChangePassword: boolean }> {
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, email, pass);
  } catch (_err: unknown) {
    // Check if student profile exists in Firestore and matches initialPassword
    const cleanEmail = email.toLowerCase().trim();
    const docs = await getDocuments<Student & { initialPassword?: string }>("students", [where("email", "==", cleanEmail)]);
    if (docs.length > 0) {
      const student = docs[0];
      if (student.initialPassword === pass) {
          try {
            credential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(credential.user, { displayName: student.name });
          } catch {
            // The Auth account may already exist; try signing in with the same password
            credential = await signInWithEmailAndPassword(auth, email, pass);
          }
          const newUid = credential.user.uid;

          // Ensure student doc and user doc are synced
          const newUserDoc: Record<string, unknown> = {
            id: newUid,
            email: student.email,
            displayName: student.name,
            role: "student",
            department: student.department || "Computer Science & Engineering",
            collegeId: student.collegeId || "",
            collegeName: student.collegeName || "",
            academicYear: student.academicYear,
            section: student.section,
            batchIds: student.batchIds || [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          return {
            user: credential.user,
            profile: newUserDoc as unknown as ExtendedUser,
            mustChangePassword: !!student.initialPassword,
          };
        }
      }
      try {
        const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
        if (methods.includes("google.com") && !methods.includes("password")) {
          throw new Error("This account was authenticated using Google Sign-In. To log in right now, please click 'Sign in with Google' above. (Admin tip: To allow simultaneous Email/Password and Google login without provider overwriting, enable 'Allow multiple accounts with the same email address' in Firebase Console -> Authentication -> Settings -> User account linking).");
        }
      } catch (methodErr: unknown) {
        if (methodErr instanceof Error && methodErr.message.includes("Google Sign-In")) {
          throw methodErr;
        }
      }
    throw new Error("Invalid student email or incorrect password.");
  }

  const uid = credential.user.uid;
  let profile: ExtendedUser | null = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);
  const studentDoc = await getDocument<Student>("students", uid);

  if (profile && profile.role === "trainer") {
    await firebaseSignOut(auth);
    throw new Error("Trainers must log in via the /admin/login portal.");
  }

  if (profile?.status === "restricted" || studentDoc?.status === "restricted") {
    await firebaseSignOut(auth);
    throw new Error("RESTRICTED_ACCOUNT: Your LMS account has been temporarily restricted by your Trainer/Admin. Please contact your Trainer for further assistance.");
  }

  if (profile?.isDeleted || profile?.status === "deleted" || studentDoc?.isDeleted || studentDoc?.status === "deleted") {
    await firebaseSignOut(auth);
    throw new Error("ACCOUNT_DELETED: Your student account has been permanently deleted.");
  }

  if (studentDoc) {
    profile = {
      ...(profile || {}),
      id: studentDoc.id || uid,
      email: studentDoc.email || credential.user.email || email,
      displayName: studentDoc.name || profile?.displayName || "Student",
      role: "student",
      department: studentDoc.department || (profile as unknown as { department?: string })?.department || "Computer Science & Engineering",
      collegeId: studentDoc.collegeId || "",
      collegeName: studentDoc.collegeName || "",
      academicYear: studentDoc.academicYear,
      section: studentDoc.section,
      batchIds: studentDoc.batchIds || [],
    } as unknown as ExtendedUser;
  }

  // Auto-clear any lingering first-login flag now that the modal has been removed
  const shouldClearFlag = profile && (profile as unknown as { mustChangePassword?: boolean }).mustChangePassword === true;
  if (shouldClearFlag) {
    await setDoc(
      doc(db, USERS_COLLECTION, uid),
      { mustChangePassword: false, updatedAt: new Date() },
      { merge: true }
    );
    await setDoc(
      doc(db, STUDENTS_COLLECTION, uid),
      { mustChangePassword: false, updatedAt: new Date() },
      { merge: true }
    );
    (profile as unknown as { mustChangePassword?: boolean }).mustChangePassword = false;
  }

  return {
    user: credential.user,
    profile,
    mustChangePassword: false,
  };
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
      const cleanEmail = collegeEmail.toLowerCase().trim();
      const existingStuds = await getDocuments<Student>(STUDENTS_COLLECTION, [where("email", "==", cleanEmail)]);
      if (existingStuds.length === 0) {
        try {
          credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        } catch (_) {
          throw new Error("An account with this email address already exists. Please sign in with your existing password.");
        }
      } else {
        throw new Error("An account with this College Email ID already exists. Please sign in instead.");
      }
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
): Promise<void> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    await updateProfile(currentUser, { displayName: details.fullName });
  }

  const email = (currentUser?.email || "").toLowerCase().trim();
  const now = new Date();

  const userDoc = {
    id: uid,
    email,
    displayName: details.fullName,
    role: "student",
    collegeName: details.collegeName,
    collegeId: details.collegeName,
    department: details.department,
    section: details.section || "A",
    createdAt: now,
    updatedAt: now,
  };

  const studentDoc: Partial<Student> = {
    id: uid,
    name: details.fullName,
    email,
    collegeName: details.collegeName,
    collegeId: details.collegeName,
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
}

/**
 * Unified Login: Authenticates and dynamically determines user role
 */
export async function unifiedLogin(email: string, pass: string): Promise<{ user: FirebaseUser; profile: ExtendedUser | null; role: UserRole | string; mustChangePassword?: boolean }> {
  let credential;
  const cleanEmail = email.toLowerCase().trim();

  // Try authenticating first
  try {
    credential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
  } catch (_err: unknown) {
    // Auth failed. Check if it's a first-time login for a student or college.
    let createdUid: string | null = null;
    let foundProfile: Record<string, any> | null = null;
    let foundRole = "";

    // 1. Check Students
    const studentDocs = await getDocuments<Student & { initialPassword?: string }>("students", [where("email", "==", cleanEmail)]);
    if (studentDocs.length > 0) {
      const student = studentDocs[0];
      if (student.initialPassword === pass) {
        try {
          credential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
          await updateProfile(credential.user, { displayName: student.name });
        } catch {
          credential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
        }
        createdUid = credential.user.uid;
        foundRole = "student";
        foundProfile = {
          id: createdUid,
          email: student.email,
          displayName: student.name,
          role: "student",
          department: student.department || "Computer Science & Engineering",
          collegeId: student.collegeId || "",
          collegeName: student.collegeName || "",
          academicYear: student.academicYear,
          section: student.section,
          batchIds: student.batchIds || [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    }

    // 2. Check Colleges
    if (!createdUid) {
      const collegeDocs = await getDocuments<import("@/types").College>("colleges", [where("adminEmail", "==", cleanEmail)]);
      if (collegeDocs.length > 0) {
        const college = collegeDocs[0];
        if (college.initialPassword === pass && college.loginEnabled !== false) {
          try {
            credential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
            await updateProfile(credential.user, { displayName: `${college.name} Admin` });
          } catch {
            credential = await signInWithEmailAndPassword(auth, cleanEmail, pass);
          }
          createdUid = credential.user.uid;
          foundRole = "college_admin";
          foundProfile = {
            id: createdUid,
            email: cleanEmail,
            displayName: `${college.name} Admin`,
            role: "college_admin",
            collegeId: college.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(doc(db, USERS_COLLECTION, createdUid), foundProfile);
        }
      }
    }

    // 3. Check Master Admin fallback
    if (!createdUid) {
      if (cleanEmail === "trainer@gmail.com" && pass === "admin123456") {
        try {
          credential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        } catch {
          throw new Error("Invalid trainer credentials.");
        }
        createdUid = credential.user.uid;
        foundRole = "admin";
        foundProfile = {
          id: createdUid,
          email: cleanEmail,
          displayName: credential.user.displayName || "Super Administrator",
          role: "admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await setDoc(doc(db, USERS_COLLECTION, createdUid), foundProfile);
      }
    }

    if (createdUid && foundProfile) {
      return {
        user: credential!.user,
        profile: foundProfile as unknown as ExtendedUser,
        role: foundRole,
        mustChangePassword: foundRole === "student" ? true : false,
      };
    }

    // Check if google
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

  // If we reach here, signInWithEmailAndPassword succeeded. We have a UID.
  const uid = credential.user.uid;
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

  if (!profile) {
    const existingUsersByEmail = await getDocuments<ExtendedUser>(USERS_COLLECTION, [where("email", "==", cleanEmail)]);
    if (existingUsersByEmail.length > 0) {
      profile = existingUsersByEmail[0];
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
    } else {
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
      } else {
        await firebaseSignOut(auth);
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
    if (!collegeDoc || collegeDoc.loginEnabled === false || collegeDoc.status === "restricted") {
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

  return { user: credential.user, profile, role, mustChangePassword: false };
}

/**
 * Unified Google Sign-In
 */
export async function unifiedGoogleLogin(): Promise<{ success: true; role: UserRole | string; user: FirebaseUser; profile: User }> {
  const credential = await signInWithPopup(auth, googleProvider);
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
