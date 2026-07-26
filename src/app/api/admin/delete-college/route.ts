import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const { id, adminIdToken } = await request.json();

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "College ID is required." }, { status: 400 });
    }

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    // Initialize App and Auth
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    if (!requesterDoc.exists || requesterDoc.data()?.role !== "admin") {
      return NextResponse.json({ error: "Only global admins can delete colleges." }, { status: 403 });
    }

    const batch = db.batch();

    // 1. Find and delete all students in this college
    const studentsSnap = await db.collection("students").where("collegeId", "==", id).get();
    
    // We need to delete their Auth accounts and their exam results
    for (const doc of studentsSnap.docs) {
      const studentId = doc.id;
      // Delete exam results for this student
      const resultsSnap = await db.collection("exam_results").where("studentId", "==", studentId).get();
      for (const resDoc of resultsSnap.docs) {
        batch.delete(resDoc.ref);
      }
      // Delete the student doc
      batch.delete(doc.ref);
      
      // Delete their auth user
      try {
        await auth.deleteUser(studentId);
      } catch (authErr: any) {
        if (authErr.code !== "auth/user-not-found") {
          console.error(`Failed to delete auth for student ${studentId}:`, authErr);
        }
      }
      
      // Delete their user doc if it exists
      const userDocRef = db.collection("users").doc(studentId);
      batch.delete(userDocRef);
    }

    // 2. Find and delete all departments in this college
    const departmentsSnap = await db.collection("departments").where("collegeId", "==", id).get();
    for (const doc of departmentsSnap.docs) {
      batch.delete(doc.ref);
    }
    
    // 3. Find and delete the college admin user if they exist
    // The college might have an associated admin in the users collection
    // Wait, college admin user ID is usually the same as the college ID, or they are associated somehow.
    // Let's delete the user doc with the college ID just in case.
    const collegeUserDocRef = db.collection("users").doc(id);
    batch.delete(collegeUserDocRef);
    
    try {
      await auth.deleteUser(id);
    } catch (authErr: any) {
      if (authErr.code !== "auth/user-not-found") {
        console.error(`Failed to delete auth for college ${id}:`, authErr);
      }
    }

    // 4. Delete the college document itself
    const collegeRef = db.collection("colleges").doc(id);
    batch.delete(collegeRef);

    // Commit the batch
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Delete college endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: (err as Error)?.message || String(err) },
      { status: 500 }
    );
  }
}
