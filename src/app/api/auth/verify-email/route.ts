import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json().catch(() => ({}));

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { exists: false, error: "Valid email is required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = getFirestore(getAdminApp());

    // Query users, students, and colleges collections in parallel via Admin SDK (bypasses security rules)
    const [usersSnap, studentsSnap, collegesSnap] = await Promise.all([
      db.collection("users").where("email", "==", normalizedEmail).limit(1).get(),
      db.collection("students").where("email", "==", normalizedEmail).limit(1).get(),
      db.collection("colleges").where("adminEmail", "==", normalizedEmail).limit(1).get(),
    ]);

    const userDoc = !usersSnap.empty ? { id: usersSnap.docs[0].id, ...usersSnap.docs[0].data() } : null;
    const studentDoc = !studentsSnap.empty ? { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() } : null;
    const collegeDoc = !collegesSnap.empty ? { id: collegesSnap.docs[0].id, ...collegesSnap.docs[0].data() } : null;

    const exists = Boolean(userDoc || studentDoc || collegeDoc);

    return NextResponse.json({
      exists,
      userDoc,
      studentDoc,
      collegeDoc,
    });
  } catch (err: unknown) {
    console.error("[AUTH] verify-email error:", err);
    return NextResponse.json(
      { exists: false, error: err instanceof Error ? getErrorMessage(err) : String(err) },
      { status: 500 }
    );
  }
}
