import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json().catch(() => ({}));

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Missing credentials" }, { status: 400 });
    }

    const masterEmail = process.env.MASTER_ADMIN_EMAIL;
    const masterPassword = process.env.MASTER_ADMIN_PASSWORD;

    if (!masterEmail || !masterPassword) {
      return NextResponse.json({ success: false, error: "Master login is not configured" }, { status: 501 });
    }

    if (email.toLowerCase().trim() === masterEmail.toLowerCase().trim() && password === masterPassword) {
      const auth = getAdminAuth();
      
      // We must retrieve the UID of the trainer/admin account from Firebase Auth
      try {
        const user = await auth.getUserByEmail(masterEmail);
        
        // Ensure master admin has the correct custom claims in Auth
        await auth.setCustomUserClaims(user.uid, { role: "trainer", collegeId: "GLOBAL" });
        
        // Include claims in custom token so they are immediately available on the client
        const customToken = await auth.createCustomToken(user.uid, { role: "trainer", collegeId: "GLOBAL" });
        
        // Ensure Firestore users document exists so frontend unifiedLogin succeeds
        const { getFirestore } = await import("firebase-admin/firestore");
        const { getAdminApp } = await import("@/lib/firebase/admin");
        const db = getFirestore(getAdminApp());
        await db.collection("users").doc(user.uid).set({
          id: user.uid,
          email: masterEmail.toLowerCase().trim(),
          displayName: "Master Admin",
          role: "trainer",
          updatedAt: new Date()
        }, { merge: true });
        
        return NextResponse.json({ success: true, customToken });
      } catch (err: unknown) {
        // If the master admin account doesn't actually exist in Firebase Auth yet, we can create it
        if ((err as any)?.code === "auth/user-not-found") {
          const newUser = await auth.createUser({
            email: masterEmail,
            password: masterPassword,
            displayName: "Master Admin"
          });
          
          await auth.setCustomUserClaims(newUser.uid, { role: "trainer", collegeId: "GLOBAL" });
          
          // Ensure Firestore users document exists so frontend unifiedLogin succeeds
          const { getFirestore } = await import("firebase-admin/firestore");
          const { getAdminApp } = await import("@/lib/firebase/admin");
          const db = getFirestore(getAdminApp());
          await db.collection("users").doc(newUser.uid).set({
            id: newUser.uid,
            email: masterEmail.toLowerCase().trim(),
            displayName: "Master Admin",
            role: "trainer",
            createdAt: new Date(),
            updatedAt: new Date()
          }, { merge: true });

          const customToken = await auth.createCustomToken(newUser.uid, { role: "trainer", collegeId: "GLOBAL" });
          return NextResponse.json({ success: true, customToken });
        }
        throw err;
      }
    }

    return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
  } catch (error) {
    console.error("[MASTER_LOGIN] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
