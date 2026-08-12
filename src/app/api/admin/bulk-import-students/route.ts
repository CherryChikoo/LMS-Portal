import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, getAdminAuth } from "@/lib/firebase/admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

const generateSecurePassword = () => process.env.DEFAULT_STUDENT_PASSWORD || "Welcome@123";

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

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 120 seconds for large bulk imports on Vercel

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

    console.time("[Firestore] Bulk Import Total");
    console.time("[Firestore] Bulk Import Pre-fetch Colleges");

    // 1. OPTIMIZATION: Pre-fetch existing colleges with pagination to avoid unbounded reads
    // Extract unique college names from import rows first to determine what we actually need
    const uniqueCollegeNames = new Set<string>();
    (rows as ImportRowInput[]).forEach((r) => {
      const rawCol = String(r.college ?? "UNASSIGNED").trim();
      const normCol = rawCol.toLowerCase();
      if (normCol && normCol !== "unassigned") {
        uniqueCollegeNames.add(normCol);
      }
    });

    const collegeMap = new Map<string, { id: string; name: string; departments: Set<string>; initialDepsCount: number }>();

    // Use targeted queries in parallel batches, grouped by first letter, with cursor pagination to avoid truncation
    const nameGroups = new Map<string, string[]>();
    uniqueCollegeNames.forEach(name => {
      const firstLetter = name[0] || 'a';
      if (!nameGroups.has(firstLetter)) {
        nameGroups.set(firstLetter, []);
      }
      nameGroups.get(firstLetter)!.push(name);
    });

    const fetchPromises = Array.from(nameGroups.entries()).map(async ([letter, names]) => {
      const startAt = letter;
      const endAt = letter + '\uf8ff'; 
      let allDocsForLetter: any[] = [];
      let lastDoc: any = null;
      let hasMore = true;

      while (hasMore) {
        let query = db.collection("colleges")
          .where("name", ">=", startAt)
          .where("name", "<=", endAt)
          .limit(500);
          
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        allDocsForLetter.push(...snapshot.docs);

        if (snapshot.docs.length < 500) {
          hasMore = false;
        } else {
          lastDoc = snapshot.docs[snapshot.docs.length - 1];
        }
      }
      return allDocsForLetter;
    });

    const allDocs = (await Promise.all(fetchPromises)).flat();
    allDocs.forEach((d) => {
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

    console.timeEnd("[Firestore] Bulk Import Pre-fetch Colleges");

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
      let batchCol = db.batch();
      let count = 0;
      for (const col of Array.from(newCollegesToCreate.values())) {
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
        count++;
        if (count >= 400) {
          await batchCol.commit();
          batchCol = db.batch();
          count = 0;
        }
      }
      if (count > 0) await batchCol.commit();
    }

    // Update departments for existing registered colleges ONLY if new departments were added
    let updatedCollegeBatches = db.batch();
    let colUpdateCount = 0;
    for (const col of Array.from(collegeMap.values())) {
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
        colUpdateCount++;
        if (colUpdateCount >= 400) {
          await updatedCollegeBatches.commit();
          updatedCollegeBatches = db.batch();
          colUpdateCount = 0;
        }
      }
    }
    if (colUpdateCount > 0) {
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

    // OPTIMIZATION: Targeted email duplicate lookup with batch size limits
    // Use cached email set for better performance on large imports
    const existingEmailSet = new Set<string>();
    if (chunkEmails.length > 0) {
      const EMAIL_BATCH_SIZE = 30; // Firestore 'in' query limit
      const MAX_CONCURRENT_QUERIES = 10; // Limit concurrent queries to avoid overwhelming Firestore
      
      // Process email lookups in controlled batches
      for (let i = 0; i < chunkEmails.length; i += EMAIL_BATCH_SIZE * MAX_CONCURRENT_QUERIES) {
        const emailLookups: Promise<any>[] = [];
        const endIndex = Math.min(i + EMAIL_BATCH_SIZE * MAX_CONCURRENT_QUERIES, chunkEmails.length);
        
        for (let j = i; j < endIndex; j += EMAIL_BATCH_SIZE) {
          const subList = chunkEmails.slice(j, Math.min(j + EMAIL_BATCH_SIZE, chunkEmails.length));
          if (subList.length > 0) {
            emailLookups.push(db.collection("users").where("email", "in", subList).get());
          }
        }
        
        const snaps = await Promise.all(emailLookups);
        snaps.forEach((snap) => {
          snap.docs.forEach((d: any) => {
            const email = d.data()?.email;
            if (email) existingEmailSet.add(String(email).toLowerCase().trim());
          });
        });
      }
    }

    const now = FieldValue.serverTimestamp();

    // OPTIMIZATION: Process students in controlled batches to avoid overwhelming Firebase Auth
    // Firebase Auth has rate limits (~500 operations/second), so we batch the parallel processing
    const CONCURRENT_BATCH_SIZE = 30; // Process 30 students at a time to avoid Firebase Auth rate limits
    const processedResults: typeof summary.results = [];

    for (let i = 0; i < items.length; i += CONCURRENT_BATCH_SIZE) {
      const batch = items.slice(i, i + CONCURRENT_BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (row) => {
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
          const tempPassword = generateSecurePassword();

          if (!email || !name) {
            return { name: name || "Unknown", email: email || "Missing", password: "", status: "skipped", reason: "Missing name or email" };
          }

          if (existingEmailSet.has(email)) {
            return { name, email, password: "", status: "duplicate", reason: "Account already exists in database" };
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
                  return { name, email, password: "", status: "duplicate", reason: "Email already registered in Auth" };
                }
              } catch {
                return { name, email, password: "", status: "failed", reason: "Auth verification error" };
              }
            } else {
              return { name, email, password: "", status: "failed", reason: (authErr as any)?.message || "Auth creation failed" };
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
            existingEmailSet.add(email);
            return { 
              name, email, password: tempPassword, status: "created",
              writeDocs: { uid, userDoc, studentDoc }
            };
          } catch (dbErr: unknown) {
            // Rollback Auth user if custom claims or processing fails
            try {
              await auth.deleteUser(uid);
            } catch (rollbackErr) {}
            return { name, email, password: "", status: "failed", reason: "Error applying user claims or processing" };
          }
        })
      );

      // Aggregated batch commit to avoid concurrency overload
      const aggregatedBatch = db.batch();
      let writeCount = 0;
      const createdUids: string[] = [];

      for (const res of batchResults) {
        if (res.status === "created" && res.writeDocs) {
          aggregatedBatch.set(db.collection("users").doc(res.writeDocs.uid), res.writeDocs.userDoc, { merge: true });
          aggregatedBatch.set(db.collection("students").doc(res.writeDocs.uid), res.writeDocs.studentDoc, { merge: true });
          createdUids.push(res.writeDocs.uid);
          writeCount++;
          // NOTE: Do NOT delete writeDocs here — rollback needs it if commit fails
        }
      }

      if (writeCount > 0) {
        try {
          await aggregatedBatch.commit();
        } catch (err) {
          console.error("Aggregated batch commit failed, rolling back auth users:", err);
          // Rollback all Auth users created in this chunk using the saved UIDs
          for (const uid of createdUids) {
            try { await auth.deleteUser(uid); } catch (_) {}
          }
          for (const res of batchResults) {
            if (res.status === "created") {
               res.status = "failed";
               res.reason = "Database batch commit failed";
            }
          }
        }
      }

      // Clean up writeDocs AFTER successful commit (or rollback)
      for (const res of batchResults) {
        delete (res as any).writeDocs;
      }

      for (const res of batchResults) {
        if (res.status === "created") summary.createdCount++;
        else if (res.status === "skipped") summary.skippedCount++;
        else if (res.status === "duplicate") summary.duplicateCount++;
        else summary.failedCount++;
        
        // Ensure we don't send writeDocs back to client
        delete (res as any).writeDocs;
        processedResults.push(res);
      }

      // Small delay between batches to avoid rate limiting (optional)
      if (i + CONCURRENT_BATCH_SIZE < items.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    summary.results = processedResults;

    console.timeEnd("[Firestore] Bulk Import Total");
    return NextResponse.json({ success: true, summary });
    } catch (err: unknown) {
      console.error("Bulk import students endpoint error:", err);
      return NextResponse.json({ error: "Internal server error during bulk import.", details: (err as any)?.message || String(err) }, { status: 500 });
    }
  }
