import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

interface ImportRowInput {
  studentName: string;
  collegeEmail: string;
  college: string;
  department: string;
  academicYear: string;
  section: string;
  batch: string;
}

function collegeNameToId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug ? `col-${slug}` : `col-general`;
}

function formatCollegeTitle(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return "default college";
  return trimmed.toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const { adminIdToken, rows, enrollmentType = "csv" } = await request.json();

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No student rows provided for import." }, { status: 400 });
    }

    // Verify admin identity
    let decodedToken;
    try {
      const auth = getAdminAuth();
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    const auth = getAdminAuth();

    // Verify admin role
    const requesterDoc = await db.collection("users").doc(decodedToken.uid).get();
    const requesterRole = requesterDoc.data()?.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "college_admin") {
      return NextResponse.json({ error: "Only admin, trainer, or college roles can import students." }, { status: 403 });
    }

    // 1. Pre-fetch existing colleges to register/sync any missing colleges
    const collegesSnap = await db.collection("colleges").get();
    const collegeMap = new Map<string, { id: string; name: string; departments: Set<string>; initialDepsCount: number }>();

    collegesSnap.docs.forEach((d) => {
      const data = d.data();
      if (!data.isDeleted && data.status !== "deleted") {
        const normName = (data.name || "").toLowerCase().trim();
        const normId = d.id.toLowerCase().trim();
        const deps = new Set<string>(Array.isArray(data.departments) ? data.departments : []);
        const entry = { id: d.id, name: data.name || formatCollegeTitle(normName), departments: deps, initialDepsCount: deps.size };
        if (normName) collegeMap.set(normName, entry);
        if (normId) collegeMap.set(normId, entry);
      }
    });

    // Extract unique colleges from the import rows
    const newCollegesToCreate = new Map<string, { id: string; name: string; departments: Set<string>; initialDepsCount: number }>();

    const RESERVED_COLLEGE_NAMES = new Set([
      "all",
      "all colleges",
      "all institutions",
      "select college",
      "select institution",
      "global",
      "default college",
      "unassigned",
      "none",
      "n/a",
      "na",
      "null",
      "undefined",
      "unknown",
    ]);

    for (const r of rows as ImportRowInput[]) {
      const rawCol = String(r.college ?? "UNASSIGNED").trim();
      const normCol = rawCol.toLowerCase();
      const dept = String(r.department ?? "General").trim();

      if (RESERVED_COLLEGE_NAMES.has(normCol)) {
        continue;
      }

      let matchedCol = collegeMap.get(normCol);
      if (!matchedCol) {
        matchedCol = newCollegesToCreate.get(normCol);
      }

      if (matchedCol) {
        if (dept) matchedCol.departments.add(dept);
      } else {
        const colId = collegeNameToId(rawCol);
        const colTitle = formatCollegeTitle(rawCol);
        const deps = new Set<string>(["Computer Science & Engineering (CSE)", "General"]);
        if (dept) deps.add(dept);
        const colEntry = { id: colId, name: colTitle, departments: deps, initialDepsCount: deps.size };
        newCollegesToCreate.set(normCol, colEntry);
        collegeMap.set(normCol, colEntry);
      }
    }

    // Create newly encountered colleges in Firestore 'colleges' collection so they are Registered Colleges
    if (newCollegesToCreate.size > 0) {
      const batchCol = db.batch();
      newCollegesToCreate.forEach((col) => {
        const colRef = db.collection("colleges").doc(col.id);
        const safeCodeName = String(col.name || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
        batchCol.set(
          colRef,
          {
            id: col.id,
            name: col.name,
            code: safeCodeName || "COLLEGE",
            departments: Array.from(col.departments),
            origin: "trainer",
            studentCount: 0,
            status: "active",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batchCol.commit();
    }

    // Update departments for existing registered colleges ONLY if new departments were added
    const updatedCollegeBatches = db.batch();
    let hasColUpdates = false;
    collegeMap.forEach((col) => {
      if (!newCollegesToCreate.has(String(col.name || "").toLowerCase()) && col.departments.size > col.initialDepsCount) {
        const colRef = db.collection("colleges").doc(col.id);
        updatedCollegeBatches.set(
          colRef,
          {
            departments: Array.from(col.departments),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        hasColUpdates = true;
      }
    });
    if (hasColUpdates) {
      await updatedCollegeBatches.commit();
    }

    // 2. High-speed parallel student Auth creation & Firestore batch writing
    const summary = {
      total: (rows as ImportRowInput[]).length,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      duplicateCount: 0,
      results: [] as any[],
    };

    const items = rows as ImportRowInput[];

    // Extract emails from current request batch for targeted duplicate checking
    const chunkEmails = items
      .map((r) => String(r.collegeEmail ?? "").toLowerCase().trim())
      .filter(Boolean);

    // Targeted email duplicate lookup (query only emails in this chunk)
    const existingEmailSet = new Set<string>();
    if (chunkEmails.length > 0) {
      const EMAIL_BATCH_SIZE = 30;
      const emailLookups: Promise<any>[] = [];
      for (let i = 0; i < chunkEmails.length; i += EMAIL_BATCH_SIZE) {
        const subList = chunkEmails.slice(i, i + EMAIL_BATCH_SIZE);
        emailLookups.push(db.collection("users").where("email", "in", subList).get());
      }
      const snaps = await Promise.all(emailLookups);
      snaps.forEach((snap) => {
        snap.docs.forEach((d: any) => {
          const email = d.data()?.email;
          if (email) existingEmailSet.add(String(email).toLowerCase().trim());
        });
      });
    }

    const now = FieldValue.serverTimestamp();

    // Process all items in this request batch in parallel
    await Promise.all(
      items.map(async (row) => {
          const email = String(row.collegeEmail ?? "").toLowerCase().trim();
          const name = String(row.studentName ?? "").trim();
          const rawCol = String(row.college ?? "Default College").trim();
          const normCol = rawCol.toLowerCase();
          const matchedCol = collegeMap.get(normCol);

          const finalCollegeId = matchedCol?.id || collegeNameToId(rawCol);
          const finalCollegeName = matchedCol?.name || formatCollegeTitle(rawCol);
          const finalDepartment = String(row.department ?? "General").trim() || "General";
          const finalAcademicYear = String(row.academicYear ?? "1st Year").trim() || "1st Year";
          const finalSection = String(row.section ?? "A").trim() || "A";
          const finalBatch = String(row.batch ?? "General Cohort").trim() || "General Cohort";
          const tempPassword = "Welcome@123";

          if (!email || !name) {
            summary.skippedCount++;
            summary.results.push({ name: name || "Unknown", email: email || "Missing", password: "", status: "skipped", reason: "Missing name or email" });
            return;
          }

          if (existingEmailSet.has(email)) {
            summary.duplicateCount++;
            summary.results.push({ name, email, password: "", status: "duplicate", reason: "Account already exists in database" });
            return;
          }

          let uid: string;
          try {
            const createdAuth = await auth.createUser({
              email,
              password: tempPassword,
              displayName: name,
            });
            uid = createdAuth.uid;
          } catch (authErr: unknown) {
            if ((authErr as any)?.code === "auth/email-already-exists") {
              try {
                const existingAuth = await auth.getUserByEmail(email);
                const userDocSnap = await db.collection("users").doc(existingAuth.uid).get();
                if (!userDocSnap.exists) {
                  await auth.updateUser(existingAuth.uid, { password: tempPassword, displayName: name });
                  uid = existingAuth.uid;
                } else {
                  summary.duplicateCount++;
                  summary.results.push({ name, email, password: "", status: "duplicate", reason: "Email already registered in Auth" });
                  return;
                }
              } catch {
                summary.failedCount++;
                summary.results.push({ name, email, password: "", status: "failed", reason: "Auth verification error" });
                return;
              }
            } else {
              summary.failedCount++;
              summary.results.push({ name, email, password: "", status: "failed", reason: (authErr as any)?.message || "Auth creation failed" });
              return;
            }
          }

          const userDoc = {
            id: uid,
            email,
            displayName: name,
            role: "student",
            collegeId: finalCollegeId,
            collegeName: finalCollegeName,
            department: finalDepartment,
            academicYear: finalAcademicYear,
            section: finalSection,
            batchIds: [finalBatch],
            mustChangePassword: true,
            initialPassword: tempPassword,
            createdAt: now,
            updatedAt: now,
          };

          const studentDoc = {
            id: uid,
            name,
            email,
            collegeId: finalCollegeId,
            collegeName: finalCollegeName,
            department: finalDepartment,
            academicYear: finalAcademicYear,
            semester: 1,
            section: finalSection,
            rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
            batchIds: [finalBatch],
            mustChangePassword: true,
            initialPassword: tempPassword,
            enrollmentType: enrollmentType,
            createdAt: now,
            updatedAt: now,
          };

          try {
            await auth.setCustomUserClaims(uid, { role: "student", collegeId: finalCollegeId });
            const studentBatch = db.batch();
            studentBatch.set(db.collection("users").doc(uid), userDoc, { merge: true });
            studentBatch.set(db.collection("students").doc(uid), studentDoc, { merge: true });
            await studentBatch.commit();

            existingEmailSet.add(email);
            summary.createdCount++;
            summary.results.push({ name, email, password: tempPassword, status: "created" });
          } catch (dbErr: unknown) {
            // ⚠️ CRITICAL FIX: Rollback Auth user if Firestore write fails
            try {
              await auth.deleteUser(uid);
              console.log(`Rolled back Auth user ${uid} after Firestore failure`);
            } catch (rollbackErr) {
              console.error(`Failed to rollback Auth user ${uid}:`, rollbackErr);
            }
            summary.failedCount++;
            summary.results.push({ name, email, password: "", status: "failed", reason: `Firestore write failed: ${(dbErr as any)?.message || "Unknown error"}. Auth account rolled back.` });
          }
        })
      );

      return NextResponse.json({ success: true, summary });
    } catch (err: unknown) {
      console.error("Bulk import students endpoint error:", err);
      return NextResponse.json({ error: "Internal server error during bulk import.", details: (err as any)?.message || String(err) }, { status: 500 });
    }
  }
