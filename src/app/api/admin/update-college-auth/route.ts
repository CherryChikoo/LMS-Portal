import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

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
    
    let collegeAdminUid: string | null = null;
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

      // Check for email uniqueness — but ONLY against OTHER entities, not self
      const emailCollegesSnap = await db.collection("colleges").where("adminEmail", "==", normalizedEmail).limit(2).get();
      const isOtherCollege = (doc: any) => doc.id !== collegeId;
      
      // If there IS an existing admin UID, also check users/students for conflicts
      if (collegeAdminUid) {
        const emailQuerySnap = await db.collection("users").where("email", "==", normalizedEmail).limit(2).get();
        const emailStudentsSnap = await db.collection("students").where("email", "==", normalizedEmail).limit(2).get();
        const isOtherUser = (doc: any) => doc.id !== collegeAdminUid;
        
        const emailExists = emailQuerySnap.docs.some(isOtherUser) || 
                            emailStudentsSnap.docs.some(isOtherUser) || 
                            emailCollegesSnap.docs.some(isOtherCollege);
        if (emailExists) {
          return NextResponse.json(
            { error: "Update failed: This email address is already in use by another account in the system.", errorCode: "firestore/email-already-exists" },
            { status: 409 }
          );
        }
      } else {
        // No existing admin — only check if another COLLEGE already uses this email
        if (emailCollegesSnap.docs.some(isOtherCollege)) {
          return NextResponse.json(
            { error: "Update failed: This email address is already assigned to another college.", errorCode: "firestore/email-already-exists" },
            { status: 409 }
          );
        }
      }

      authUpdateFields.email = normalizedEmail;
    }
    if (collegeName) {
      authUpdateFields.displayName = `${(collegeName as string).trim()} Admin`;
    }

    // If an existing admin account exists, UPDATE it
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
    
    // If NO existing admin account, CREATE a new Firebase Auth user for this college
    if (!collegeAdminUid && adminEmail) {
      const normalizedEmail = (adminEmail as string).toLowerCase().trim();
      const defaultPassword = `College@${collegeId.slice(0, 6)}2024`;
      
      try {
        // Check if email already exists in Firebase Auth
        try {
          const existingUser = await auth.getUserByEmail(normalizedEmail);
          // Email already exists in Auth — reuse this account as the college admin
          collegeAdminUid = existingUser.uid;
          // Update their display name if provided
          if (collegeName) {
            await auth.updateUser(collegeAdminUid, { displayName: `${(collegeName as string).trim()} Admin` });
          }
        } catch {
          // Email doesn't exist in Auth — create a new user
          const newUser = await auth.createUser({
            email: normalizedEmail,
            password: defaultPassword,
            displayName: collegeName ? `${(collegeName as string).trim()} Admin` : `${collegeId} Admin`,
          });
          collegeAdminUid = newUser.uid;
        }
      } catch (createErr: any) {
        console.error("Failed to create college admin auth user:", createErr);
        return NextResponse.json(
          { error: createErr.message || "Failed to create College Admin Auth account." },
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

    // Update or Create User Document for the college admin
    if (collegeAdminUid) {
      const userUpdates: Record<string, any> = {
        role: "college_admin",
        collegeId: collegeId,
      };
      if (adminEmail) userUpdates.email = adminEmail.toLowerCase().trim();
      if (collegeName) {
        userUpdates.displayName = `${(collegeName as string).trim()} Admin`;
        userUpdates.collegeName = (collegeName as string).trim();
      }
      
      batch.set(db.collection("users").doc(collegeAdminUid), userUpdates, { merge: true });
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
