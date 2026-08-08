import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { isEmailInUse } from "@/lib/server/email-uniqueness";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token." }, { status: 401 });
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    const { collegeId, adminEmail, collegeName } = await request.json();

    if (!collegeId || typeof collegeId !== "string") {
      return NextResponse.json({ error: "College ID is required." }, { status: 400 });
    }

    let decodedToken;
    try {
      const auth = getAdminAuth();
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = decodedToken.uid;
    const db = getFirestore();

    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists) {
      return NextResponse.json({ error: "Admin user not found in database." }, { status: 403 });
    }

    const requesterRole = requesterDoc.data()?.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json({ error: "Only admins or trainers can update college authentication details." }, { status: 403 });
    }

    if (!adminEmail && !collegeName) {
      return NextResponse.json(
        { error: "At least one update parameter (adminEmail, collegeName) must be provided." },
        { status: 400 }
      );
    }

    // Find the College Admin's UID by their current email in the colleges collection
    const collegeDocSnap = await db.collection("colleges").doc(collegeId).get();
    if (!collegeDocSnap.exists) {
      return NextResponse.json({ error: "College not found." }, { status: 404 });
    }
    const currentAdminEmail = collegeDocSnap.data()?.adminEmail;
    
    let collegeAdminUid = null;
    const auth = getAdminAuth();
    
    if (currentAdminEmail) {
      try {
        const adminUser = await auth.getUserByEmail(currentAdminEmail);
        collegeAdminUid = adminUser.uid;
      } catch (err: any) {
        console.warn(`Could not find auth user for current admin email ${currentAdminEmail}:`, err.message);
      }
    }
    
    // Fallback: search users collection for college_admin role with this collegeId
    if (!collegeAdminUid) {
      const usersSnap = await db.collection("users")
        .where("collegeId", "==", collegeId)
        .where("role", "==", "college_admin")
        .limit(1).get();
      if (!usersSnap.empty) {
        collegeAdminUid = usersSnap.docs[0].id;
      }
    }

    const authUpdateFields: Record<string, string> = {};
    if (adminEmail) {
      const normalizedEmail = (adminEmail as string).toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
      }

      const emailCheckStart = Date.now();
      const emailExists = await isEmailInUse(db, normalizedEmail, {
        excludeUserIds: collegeAdminUid ? [collegeAdminUid] : [],
        excludeCollegeIds: [collegeId],
        limitPerCollection: 3,
      });
      console.info(`[perf][update-college-auth] email uniqueness check took ${Date.now() - emailCheckStart}ms`);

      if (emailExists) {
        return NextResponse.json(
          { error: "Update failed: This email address is already in use by another account in the system.", errorCode: "firestore/email-already-exists" },
          { status: 409 }
        );
      }

      authUpdateFields.email = normalizedEmail;
    }
    if (collegeName) {
      authUpdateFields.displayName = `${(collegeName as string).trim()} Admin`;
    }

    if (collegeAdminUid && Object.keys(authUpdateFields).length > 0) {
      try {
        await auth.updateUser(collegeAdminUid, authUpdateFields);
      } catch (authErr: any) {
        if (authErr.code === "auth/email-already-exists") {
          return NextResponse.json(
            { error: "Update failed: This admin email is already in use by another account.", errorCode: "auth/email-already-exists" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: authErr.message || "Failed to update College Admin Auth account." },
          { status: 500 }
        );
      }
    }

    const batch = db.batch();
    
    // Update College Document
    const collegeUpdates: Record<string, any> = {};
    if (adminEmail) collegeUpdates.adminEmail = adminEmail.toLowerCase().trim();
    if (collegeName) collegeUpdates.name = collegeName.trim().toLowerCase();
    
    if (Object.keys(collegeUpdates).length > 0) {
      batch.set(db.collection("colleges").doc(collegeId), collegeUpdates, { merge: true });
    }

    // Update User Document
    if (collegeAdminUid) {
      const userUpdates: Record<string, any> = {};
      if (adminEmail) userUpdates.email = adminEmail.toLowerCase().trim();
      if (collegeName) {
        userUpdates.displayName = `${(collegeName as string).trim()} Admin`;
        userUpdates.collegeName = (collegeName as string).trim();
      }
      
      if (Object.keys(userUpdates).length > 0) {
        batch.set(db.collection("users").doc(collegeAdminUid), userUpdates, { merge: true });
      }
    }

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Update college auth endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: (err as { message?: string })?.message || String(err) },
      { status: 500 }
    );
  }
}
