import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { z } from "zod";

const DeleteCollegeSchema = z.object({
  id: z.string().min(1, "College ID is required."),
  collegeName: z.string().optional(),
}).strict();

const cleanSlug = (v?: string | null): string =>
  v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "";

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, stage, errorCode: "auth/missing-token", message: "Admin authorization token is required in headers." },
        { status: 401 }
      );
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    const body = await request.json().catch(() => ({}));
    const parseResult = await DeleteCollegeSchema.safeParseAsync(body);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, stage, errorCode: "invalid-argument", message: parseResult.error.errors[0].message },
        { status: 400 }
      );
    }
    const { id, collegeName: clientCollegeName } = parseResult.data;

    stage = "verifyAdminToken";
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, stage, errorCode: err?.code, message: "Invalid or expired admin session.", details: String(err) },
        { status: 401 }
      );
    }

    stage = "verifyAdminRole";
    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data()?.role : undefined;
    if (requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json(
        { success: false, stage, errorCode: "permission-denied", message: "Only admin or trainer roles can delete colleges." },
        { status: 403 }
      );
    }

    stage = "fetchCollegeData";
    const collegeRef = db.collection("colleges").doc(id);
    const collegeUserDocRef = db.collection("users").doc(id);
    let collegeDoc = await collegeRef.get();
    let collegeName = collegeDoc.exists ? collegeDoc.data()?.name : (clientCollegeName || "");
    let adminEmail = collegeDoc.exists ? collegeDoc.data()?.adminEmail : "";

    const targetSlugId = cleanSlug(id);
    const targetSlugName = cleanSlug(collegeName || clientCollegeName);

    stage = "collectAuthAccountsToPurge";
    const authUidsToDelete = new Set<string>();
    const refsToDeleteMap = new Map<string, any>();

    // Add direct college references
    authUidsToDelete.add(id);
    refsToDeleteMap.set(collegeRef.path, collegeRef);
    refsToDeleteMap.set(collegeUserDocRef.path, collegeUserDocRef);

    // If college has an admin email in Firestore, lookup its Auth UID
    if (adminEmail) {
      try {
        const u = await auth.getUserByEmail(adminEmail.toLowerCase().trim());
        authUidsToDelete.add(u.uid);
        refsToDeleteMap.set(db.collection("users").doc(u.uid).path, db.collection("users").doc(u.uid));
      } catch (_) {}
    }

    // 1. Sweep college admin user profiles in Firestore
    const collegeAdminUsersSnap = await db.collection("users").where("role", "==", "college_admin").get();
    collegeAdminUsersSnap.docs.forEach((uDoc) => {
      const uData = uDoc.data();
      const uColId = cleanSlug(uData.collegeId);
      const uColName = cleanSlug(uData.collegeName);
      const uEmail = uData.email ? uData.email.toLowerCase().trim() : "";

      if (
        uDoc.id === id ||
        (targetSlugId && uColId === targetSlugId) ||
        (targetSlugName && uColName === targetSlugName) ||
        (targetSlugName && uColId === targetSlugName) ||
        (adminEmail && uEmail === adminEmail.toLowerCase().trim())
      ) {
        authUidsToDelete.add(uDoc.id);
        refsToDeleteMap.set(uDoc.ref.path, uDoc.ref);
        if (uEmail) {
          auth.getUserByEmail(uEmail).then((u) => authUidsToDelete.add(u.uid)).catch(() => {});
        }
      }
    });

    // 2. Sweep all students belonging to this college
    const allStudentsSnap = await db.collection("students").get();
    const studentIds: string[] = [];

    allStudentsSnap.docs.forEach((sDoc) => {
      const sData = sDoc.data();
      const sColId = cleanSlug(sData.collegeId);
      const sColName = cleanSlug(sData.collegeName);
      const sEmail = sData.email ? sData.email.toLowerCase().trim() : "";

      const matches =
        sDoc.id === id ||
        sData.collegeId === id ||
        sData.collegeName === collegeName ||
        (targetSlugId && sColId === targetSlugId) ||
        (targetSlugId && sColName === targetSlugId) ||
        (targetSlugName && sColId === targetSlugName) ||
        (targetSlugName && sColName === targetSlugName);

      if (matches) {
        studentIds.push(sDoc.id);
        authUidsToDelete.add(sDoc.id);
        refsToDeleteMap.set(sDoc.ref.path, sDoc.ref);
        refsToDeleteMap.set(db.collection("users").doc(sDoc.id).path, db.collection("users").doc(sDoc.id));

        if (sEmail) {
          auth.getUserByEmail(sEmail).then((u) => authUidsToDelete.add(u.uid)).catch(() => {});
        }
      }
    });

    // 3. Fetch departments, batches, exams, resources
    const [departmentsSnap, batchesSnap, examsSnap, resourcesSnap] = await Promise.all([
      db.collection("departments").get(),
      db.collection("batches").get(),
      db.collection("exams").get(),
      db.collection("resources").get(),
    ]);

    departmentsSnap.docs.forEach((d) => {
      const colId = cleanSlug(d.data().collegeId);
      if (colId === targetSlugId || colId === targetSlugName) refsToDeleteMap.set(d.ref.path, d.ref);
    });

    batchesSnap.docs.forEach((b) => {
      const colId = cleanSlug(b.data().collegeId);
      if (colId === targetSlugId || colId === targetSlugName) refsToDeleteMap.set(b.ref.path, b.ref);
    });

    examsSnap.docs.forEach((eDoc) => {
      const eData = eDoc.data();
      const eColId = eData.collegeId || "";
      const eColName = eData.collegeName || "";
      const eTargets: any[] = Array.isArray(eData.targets) ? eData.targets : [];

      const matchesCol =
        eDoc.id === id ||
        eColId === id ||
        eColName === collegeName ||
        (targetSlugId && cleanSlug(eColId) === targetSlugId) ||
        (targetSlugId && cleanSlug(eColName) === targetSlugId) ||
        (targetSlugName && cleanSlug(eColId) === targetSlugName) ||
        (targetSlugName && cleanSlug(eColName) === targetSlugName) ||
        eTargets.some((t) => {
          const tColId = t.collegeId || "";
          const tColName = t.collegeName || "";
          return (
            tColId === id ||
            tColName === collegeName ||
            (targetSlugId && cleanSlug(tColId) === targetSlugId) ||
            (targetSlugName && cleanSlug(tColId) === targetSlugName) ||
            (targetSlugName && cleanSlug(tColName) === targetSlugName)
          );
        });

      if (matchesCol) {
        refsToDeleteMap.set(eDoc.ref.path, eDoc.ref);
      }
    });

    resourcesSnap.docs.forEach((rDoc) => {
      const rData = rDoc.data();
      const rColId = rData.collegeId || "";
      const rColName = rData.collegeName || "";
      const rTargets: any[] = Array.isArray(rData.targets) ? rData.targets : [];

      const matchesCol =
        rDoc.id === id ||
        rColId === id ||
        rColName === collegeName ||
        (targetSlugId && cleanSlug(rColId) === targetSlugId) ||
        (targetSlugId && cleanSlug(rColName) === targetSlugId) ||
        (targetSlugName && cleanSlug(rColId) === targetSlugName) ||
        (targetSlugName && cleanSlug(rColName) === targetSlugName) ||
        rTargets.some((t) => {
          const tColId = t.collegeId || "";
          const tColName = t.collegeName || "";
          return (
            tColId === id ||
            tColName === collegeName ||
            (targetSlugId && cleanSlug(tColId) === targetSlugId) ||
            (targetSlugName && cleanSlug(tColId) === targetSlugName) ||
            (targetSlugName && cleanSlug(tColName) === targetSlugName)
          );
        });

      if (matchesCol) {
        refsToDeleteMap.set(rDoc.ref.path, rDoc.ref);
      }
    });

    // 4. Fetch exam results for deleted students
    if (studentIds.length > 0) {
      for (let i = 0; i < studentIds.length; i += 10) {
        const chunk = studentIds.slice(i, i + 10);
        try {
          const resultsSnap = await db.collection("exam_results").where("studentId", "in", chunk).get();
          resultsSnap.docs.forEach((resDoc) => refsToDeleteMap.set(resDoc.ref.path, resDoc.ref));
        } catch (_) {}
      }
    }

    // 5. Purge Auth accounts from Firebase Auth
    stage = "deleteFirebaseAuthAccounts";
    const uidsList = Array.from(authUidsToDelete);
    await Promise.all(
      uidsList.map((uid) =>
        auth.deleteUser(uid).catch((err: any) => {
          if (err?.code !== "auth/user-not-found") {
            console.warn(`Auth deletion note for UID ${uid}:`, err?.message);
          }
        })
      )
    );

    // 6. Delete Storage files
    stage = "deleteStorageFiles";
    try {
      const bucket = getStorage(getAdminApp()).bucket();
      if (bucket) {
        await bucket.deleteFiles({ prefix: `colleges/${id}/` }).catch(() => {});
      }
    } catch (_) {}

    // 7. Delete all Firestore documents in batches
    stage = "deleteFirestoreDocuments";
    const refsToDelete = Array.from(refsToDeleteMap.values());
    const MAX_OPS = 450;
    for (let i = 0; i < refsToDelete.length; i += MAX_OPS) {
      const chunk = refsToDelete.slice(i, i + MAX_OPS);
      const batch = db.batch();
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return NextResponse.json({ success: true, purgedAuthAccounts: uidsList.length });
  } catch (err: unknown) {
    console.error({ route: "/api/admin/delete-college", stage, errorCode: err?.code, message: err?.message, stack: err?.stack });
    return NextResponse.json(
      { success: false, stage, errorCode: err?.code, message: err?.message || "Failed to delete college and clear Firebase data." },
      { status: 500 }
    );
  }
}
