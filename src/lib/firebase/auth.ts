import { getErrorMessage } from '@/lib/utils/error';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth } from "./config";

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(
  email: string,
  password: string,
  displayName: string
) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential;
}

export async function signOut() {
  return firebaseSignOut(auth);
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export { signInWithPopup, signInWithRedirect, getRedirectResult };

export async function signInWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err: unknown) {
    const code = (err as any)?.code || "";
    // Only use redirect fallback if popup is strictly blocked by browser policy
    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, googleProvider);
      return null as any;
    }
    throw err;
  }
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
