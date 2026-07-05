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
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { googleProvider, signInWithGoogle } from "@/lib/firebase/auth";
import { getDocument, setDoc, doc, getDocuments, where } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { setAuthSession, clearAuthSession } from "@/lib/utils/auth-session";
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
      (email.toLowerCase() === "trainer@lms.dev" && pass === "admin123456") ||
      (email.toLowerCase() === "admin@lms.dev" && pass === "admin123456")
    ) {
      try {
        credential = await createUserWithEmailAndPassword(auth, email, pass);
      } catch {
        throw new Error("Invalid trainer credentials or account already exists with a different password.");
      }
    } else {
      throw new Error("Invalid administrative credentials. Please check your email and password.");
    }
  }
  const uid = credential.user.uid;
  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

  // If initial bootstrap admin (e.g. first login or trainer account creation)
  if (!profile) {
    if (email.toLowerCase() === "trainer@lms.dev" || email.toLowerCase() === "admin@lms.dev") {
      profile = {
        id: uid,
        email: email.toLowerCase(),
        displayName: credential.user.displayName || (email.toLowerCase() === "admin@lms.dev" ? "Chief Assessment Officer" : "Lead Trainer Faculty"),
        role: email.toLowerCase() === "admin@lms.dev" ? "admin" : "trainer",
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
            collegeId: student.collegeId,
            collegeName: student.collegeName || "Global Institute",
            academicYear: student.academicYear,
            section: student.section,
            batchIds: student.batchIds,
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
    throw new Error("Invalid student email or incorrect password.");
  }

  const uid = credential.user.uid;
  let profile: ExtendedUser | null = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);
  const studentDoc = await getDocument<Student>("students", uid);

  if (profile && profile.role === "trainer") {
    await firebaseSignOut(auth);
    throw new Error("Trainers must log in via the /admin/login portal.");
  }

  if (studentDoc) {
    profile = {
      ...(profile || {}),
      id: studentDoc.id || uid,
      email: studentDoc.email || credential.user.email || email,
      displayName: studentDoc.name || profile?.displayName || "Student",
      role: "student",
      department: studentDoc.department || (profile as unknown as { department?: string })?.department || "Computer Science & Engineering",
      collegeId: studentDoc.collegeId,
      collegeName: studentDoc.collegeName || "Global Institute",
      academicYear: studentDoc.academicYear,
      section: studentDoc.section,
      batchIds: studentDoc.batchIds,
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

  let profile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);

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

  const role: UserRole = profile?.role || "student";

  // If a students doc exists (e.g. CSV-imported student first Google login),
  // merge its data into users/{uid} and allow login.
  if (studDocs.length > 0) {
    const s = studDocs[0];
    const existing = profile;
    profile = {
      ...(existing || {}),
      id: existing?.id || uid,
      email: s.email || email,
      displayName: s.name || existing?.displayName || name,
      role,
      department: s.department || existing?.department || "Computer Science & Engineering",
      collegeId: s.collegeId || existing?.collegeId || collegeNameToId(s.collegeName || "Global Institute"),
      collegeName: s.collegeName || existing?.collegeName || "Global Institute",
      academicYear: s.academicYear || existing?.academicYear,
      section: s.section || existing?.section,
      batchIds: s.batchIds || existing?.batchIds,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    } as ExtendedUser;
    await setDoc(doc(db, USERS_COLLECTION, uid), profile, { merge: true });
  }

  const sessionUser = {
    id: uid,
    name: profile!.displayName,
    email: profile!.email,
    role,
    department: profile?.department || "Computer Science & Engineering",
    collegeId: profile?.collegeId,
    collegeName: profile?.collegeName || "Global Institute",
    academicYear: profile?.academicYear,
    section: profile?.section,
    batchIds: profile?.batchIds,
  };

  await setAuthSession(token, role, sessionUser);

  return { success: true, role, user: credential.user, profile: profile! };
}

/**
 * Sign up Student via Google SSO popup.
 * Rejects if the Google email/UID is already associated with an account;
 * otherwise creates only a minimal `users/{uid}` doc and returns the user so
 * the register page can continue to the academic-details step.
 */
export async function studentGoogleSignUp(): Promise<{ user: FirebaseUser }> {
  const credential = await signInWithGoogle();
  const uid = credential.user.uid;
  const email = (credential.user.email || "").toLowerCase().trim();
  const name = credential.user.displayName || email.split("@")[0] || "Student";

  const existingProfile = await getDocument<ExtendedUser>(USERS_COLLECTION, uid);
  const studDocs = await getDocuments<Student>(STUDENTS_COLLECTION, [where("email", "==", email)]);

  if (existingProfile || studDocs.length > 0) {
    await firebaseSignOut(auth);
    throw new Error("An account with this email already exists. Please sign in instead.");
  }

  // No existing account: create the minimal users/{uid} doc and let the
  // register page continue to the academic-details step.
  const profile: ExtendedUser = {
    id: uid,
    email,
    displayName: name,
    role: "student",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await setDoc(doc(db, USERS_COLLECTION, uid), profile);

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
    if (err instanceof Error && err.message.includes("auth/email-already-in-use")) {
      throw new Error("An account with this College Email ID already exists. Please sign in instead.");
    }
    throw err;
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

  await Promise.all([
    setDoc(doc(db, USERS_COLLECTION, uid), userDoc),
    setDoc(doc(db, STUDENTS_COLLECTION, uid), studentDoc),
  ]);

  return { user: credential.user };
}

/**
 * Post-registration step: Save complete academic details (Name, College Name, Department, Section)
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

  const userUpdate = {
    displayName: details.fullName,
    updatedAt: new Date(),
  };

  const studentUpdate: Partial<Student> = {
    name: details.fullName,
    collegeName: details.collegeName,
    collegeId: details.collegeName,
    department: details.department,
    section: details.section || "A",
    updatedAt: new Date(),
  };

  await Promise.all([
    setDoc(doc(db, USERS_COLLECTION, uid), userUpdate, { merge: true }),
    setDoc(doc(db, STUDENTS_COLLECTION, uid), studentUpdate, { merge: true }),
  ]);
}

