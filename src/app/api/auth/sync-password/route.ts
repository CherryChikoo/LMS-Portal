import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json().catch(() => ({}));

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = getFirestore(getAdminApp());
    const authAdmin = getAdminAuth();

    // Check if account exists in Firestore
    const [usersSnap, studentsSnap, collegesSnap] = await Promise.all([
      db.collection("users").where("email", "==", normalizedEmail).limit(1).get(),
      db.collection("students").where("email", "==", normalizedEmail).limit(1).get(),
      db.collection("colleges").where("adminEmail", "==", normalizedEmail).limit(1).get(),
    ]);

    const userDoc = !usersSnap.empty ? usersSnap.docs[0].data() : null;
    const studentDoc = !studentsSnap.empty ? studentsSnap.docs[0].data() : null;
    const collegeDoc = !collegesSnap.empty ? collegesSnap.docs[0].data() : null;

    if (!userDoc && !studentDoc && !collegeDoc) {
      return NextResponse.json({ success: false, error: "Account not registered." }, { status: 404 });
    }

    // Verify stored password if initialPassword exists
    const expectedPassword = studentDoc?.initialPassword || userDoc?.initialPassword || collegeDoc?.initialPassword;
    if (expectedPassword && expectedPassword !== password) {
      return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
    }

    // Sync / set password in Firebase Auth
    let authUser;
    try {
      authUser = await authAdmin.getUserByEmail(normalizedEmail);
      await authAdmin.updateUser(authUser.uid, { password });
    } catch (authErr: unknown) {
      if ((authErr as any)?.code === "auth/user-not-found" || (authErr as any)?.message?.includes("user-not-found")) {
        authUser = await authAdmin.createUser({
          email: normalizedEmail,
          password,
          displayName: studentDoc?.name || userDoc?.displayName || normalizedEmail.split("@")[0],
        });
      } else {
        throw authErr;
      }
    }

    return NextResponse.json({ success: true, uid: authUser.uid });
  } catch (err: unknown) {
    console.error("[AUTH] sync-password error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? getErrorMessage(err) : String(err) },
      { status: 500 }
    );
  }
}
