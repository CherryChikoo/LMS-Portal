import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";

const cleanSlug = (v?: string | null): string =>
  v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "";

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const body = await request.json().catch(() => ({}));
    const { adminIdToken } = body;

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json(
        { success: false, stage, error: "Admin authorization token is required." },
        { status: 401 }
      );
    }

    stage = "verifyAdminToken";
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(adminIdToken);

    stage = "verifyAdminRole";
    const db = getAdminFirestore();
    const requesterDoc = await db.collection("users").doc(decodedToken.uid).get();

    if (!requesterDoc.exists || (requesterDoc.data()?.role !== "admin" && requesterDoc.data()?.role !== "trainer")) {
      return NextResponse.json(
        { success: false, stage, error: "Unauthorized. Admin privileges required." },
        { status: 403 }
      );
    }

    stage = "runNormalizationMigration";
    let updatedStudentsCount = 0;
    let updatedUsersCount = 0;
    let updatedExamsCount = 0;
    let updatedResourcesCount = 0;
    let updatedCollegesCount = 0;

    let batch = db.batch();
    let batchOpCount = 0;

    // 1. Normalize Colleges Collection (both official & outside colleges) to small letters
    const collegesSnap = await db.collection("colleges").get();
    for (const docSnap of collegesSnap.docs) {
      const data = docSnap.data();
      const rawName = data.name;
      if (rawName && typeof rawName === "string") {
        const lowerName = rawName.toLowerCase().trim();
        if (rawName !== lowerName) {
          batch.update(docSnap.ref, {
            name: lowerName,
            updatedAt: new Date(),
          });
          updatedCollegesCount++;
          batchOpCount++;

          if (batchOpCount >= 450) {
            await batch.commit();
            batch = db.batch();
            batchOpCount = 0;
          }
        }
      }
    }

    // 2. Normalize Students (both collegeId and collegeName to small letters)
    const studentsSnap = await db.collection("students").get();
    for (const docSnap of studentsSnap.docs) {
      const data = docSnap.data();
      const rawCId = data.collegeId;
      const rawCName = data.collegeName;

      const slug = cleanSlug(rawCId || rawCName);
      const lowerName = rawCName ? String(rawCName).toLowerCase().trim() : slug;

      if ((rawCId && rawCId !== slug) || (rawCName && rawCName !== lowerName)) {
        batch.update(docSnap.ref, {
          collegeId: slug,
          collegeName: lowerName,
          updatedAt: new Date(),
        });
        updatedStudentsCount++;
        batchOpCount++;

        if (batchOpCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchOpCount = 0;
        }
      }
    }

    // 3. Normalize Users
    const usersSnap = await db.collection("users").get();
    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data();
      const rawCId = data.collegeId;
      const rawCName = data.collegeName;

      const slug = cleanSlug(rawCId || rawCName);
      const lowerName = rawCName ? String(rawCName).toLowerCase().trim() : slug;

      if ((rawCId && rawCId !== slug) || (rawCName && rawCName !== lowerName)) {
        batch.update(docSnap.ref, {
          collegeId: slug,
          collegeName: lowerName,
          updatedAt: new Date(),
        });
        updatedUsersCount++;
        batchOpCount++;

        if (batchOpCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchOpCount = 0;
        }
      }
    }

    // 4. Normalize Exams targets
    const examsSnap = await db.collection("exams").get();
    for (const docSnap of examsSnap.docs) {
      const data = docSnap.data();
      const targets = data.targets;

      if (Array.isArray(targets) && targets.length > 0) {
        let modified = false;
        const normalizedTargets = targets.map((t: Record<string, unknown>) => {
          const cId = t.collegeId as string | undefined;
          const cName = t.collegeName as string | undefined;
          if (cId && cId !== "GLOBAL" && cId !== "*") {
            const slug = cleanSlug(cId);
            const lowerName = cName ? cName.toLowerCase().trim() : slug;
            if ((slug && slug !== cId) || (cName && cName !== lowerName)) {
              modified = true;
              return { ...t, collegeId: slug, collegeName: lowerName };
            }
          }
          return t;
        });

        if (modified) {
          batch.update(docSnap.ref, {
            targets: normalizedTargets,
            updatedAt: new Date(),
          });
          updatedExamsCount++;
          batchOpCount++;

          if (batchOpCount >= 450) {
            await batch.commit();
            batch = db.batch();
            batchOpCount = 0;
          }
        }
      }
    }

    // 5. Normalize Resources targets
    const resourcesSnap = await db.collection("resources").get();
    for (const docSnap of resourcesSnap.docs) {
      const data = docSnap.data();
      const targets = data.targets;

      if (Array.isArray(targets) && targets.length > 0) {
        let modified = false;
        const normalizedTargets = targets.map((t: Record<string, unknown>) => {
          const cId = t.collegeId as string | undefined;
          const cName = t.collegeName as string | undefined;
          if (cId && cId !== "GLOBAL" && cId !== "*") {
            const slug = cleanSlug(cId);
            const lowerName = cName ? cName.toLowerCase().trim() : slug;
            if ((slug && slug !== cId) || (cName && cName !== lowerName)) {
              modified = true;
              return { ...t, collegeId: slug, collegeName: lowerName };
            }
          }
          return t;
        });

        if (modified) {
          batch.update(docSnap.ref, {
            targets: normalizedTargets,
            updatedAt: new Date(),
          });
          updatedResourcesCount++;
          batchOpCount++;

          if (batchOpCount >= 450) {
            await batch.commit();
            batch = db.batch();
            batchOpCount = 0;
          }
        }
      }
    }

    if (batchOpCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      summary: {
        updatedCollegesCount,
        updatedStudentsCount,
        updatedUsersCount,
        updatedExamsCount,
        updatedResourcesCount,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Migration failed";
    console.error({ route: "/api/admin/normalize-colleges", stage, error: errorMsg });
    return NextResponse.json({ success: false, stage, error: errorMsg }, { status: 500 });
  }
}
