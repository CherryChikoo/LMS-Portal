import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { email, adminIdToken } = await request.json();

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Verify admin
    const auth = getAdminAuth();
    try {
      await auth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email exists in Firestore (only active records)
    const db = getFirestore();
    
    // Check for active users
    const existingUsersSnapshot = await db.collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    
    // Filter for truly active users
    const activeUsers = existingUsersSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.isActive !== false && data.isDeleted !== true;
    });
    
    if (activeUsers.length > 0) {
      return NextResponse.json({
        exists: true,
        uid: activeUsers[0].id,
        provider: "firestore",
        reason: "active_user"
      });
    }
    
    // Check for active colleges with this admin email
    const existingCollegesSnapshot = await db.collection("colleges")
      .where("adminEmail", "==", normalizedEmail)
      .limit(1)
      .get();
      
    const activeColleges = existingCollegesSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.isDeleted !== true && data.status !== 'deleted';
    });
    
    if (activeColleges.length > 0) {
      return NextResponse.json({
        exists: true,
        uid: activeColleges[0].id,
        provider: "firestore",
        reason: "college_admin"
      });
    }
    
    // Check for active students
    const existingStudentsSnapshot = await db.collection("students")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
      
    const activeStudents = existingStudentsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.isActive !== false && data.isDeleted !== true;
    });
    
    if (activeStudents.length > 0) {
      return NextResponse.json({
        exists: true,
        uid: activeStudents[0].id,
        provider: "firestore",
        reason: "student"
      });
    }

    // Check if email exists in Firebase Auth
    try {
      const existingUser = await auth.getUserByEmail(normalizedEmail);
      return NextResponse.json({
        exists: true,
        uid: existingUser.uid,
        provider: existingUser.providerData[0]?.providerId || "password"
      });
    } catch (err: unknown) {
      if ((err as any)?.code === "auth/user-not-found") {
        return NextResponse.json({ exists: false });
      }
      throw err;
    }
  } catch (err: unknown) {
    console.error("Check email exists error:", err);
    return NextResponse.json(
      { error: "Failed to check email existence.", details: (err as any)?.message || String(err) },
      { status: 500 }
    );
  }
}
