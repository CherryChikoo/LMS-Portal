import { getErrorMessage } from '@/lib/utils/error';
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

    // OPTIMIZATION: Process collections in batches to prevent timeout and memory issues
    const BATCH_SIZE = 500;

    // Helper function to normalize a collection in paginated batches
    async function normalizeCollection(
      collectionName: string,
      processFn: (data: any) => any | null
    ): Promise<number> {
      let updatedCount = 0;
      let lastDocId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let query = db.collection(collectionName)
          .orderBy('__name__')
          .limit(BATCH_SIZE);
        
        if (lastDocId) {
          query = query.startAfter(lastDocId);
        }

        const snapshot = await query.get();
        if (snapshot.empty) break;

        let batch = db.batch();
        let batchOpCount = 0;

        for (const docSnap of snapshot.docs) {
          const updates = processFn(docSnap.data());
          
          if (updates) {
            batch.update(docSnap.ref, {
              ...updates,
              updatedAt: new Date(),
            });
            batchOpCount++;
            updatedCount++;

            if (batchOpCount >= 450) {
              await batch.commit();
              batch = db.batch();
              batchOpCount = 0;
            }
          }
        }

        if (batchOpCount > 0) {
          await batch.commit();
        }

        lastDocId = snapshot.docs[snapshot.docs.length - 1].id;
        hasMore = snapshot.docs.length === BATCH_SIZE;
        
        console.log(`[Normalize] Processed ${snapshot.docs.length} docs from ${collectionName}, updated: ${updatedCount}`);
      }

      return updatedCount;
    }

    // 1. Normalize Colleges Collection
    updatedCollegesCount = await normalizeCollection('colleges', (data) => {
      const rawName = data.name;
      if (rawName && typeof rawName === "string") {
        const lowerName = rawName.toLowerCase().trim();
        if (rawName !== lowerName) {
          return { name: lowerName };
        }
      }
      return null;
    });

    // 2. Normalize Students (both collegeId and collegeName)
    updatedStudentsCount = await normalizeCollection('students', (data) => {
      const rawCId = data.collegeId;
      const rawCName = data.collegeName;

      const slug = cleanSlug(rawCId || rawCName);
      const lowerName = rawCName ? String(rawCName).toLowerCase().trim() : slug;

      if ((rawCId && rawCId !== slug) || (rawCName && rawCName !== lowerName)) {
        return {
          collegeId: slug,
          collegeName: lowerName,
        };
      }
      return null;
    });

    // 3. Normalize Users
    updatedUsersCount = await normalizeCollection('users', (data) => {
      const rawCId = data.collegeId;
      const rawCName = data.collegeName;

      const slug = cleanSlug(rawCId || rawCName);
      const lowerName = rawCName ? String(rawCName).toLowerCase().trim() : slug;

      if ((rawCId && rawCId !== slug) || (rawCName && rawCName !== lowerName)) {
        return {
          collegeId: slug,
          collegeName: lowerName,
        };
      }
      return null;
    });

    // 4. Normalize Exams targets
    updatedExamsCount = await normalizeCollection('exams', (data) => {
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
          return { targets: normalizedTargets };
        }
      }
      return null;
    });

    // 5. Normalize Resources targets
    updatedResourcesCount = await normalizeCollection('resources', (data) => {
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
          return { targets: normalizedTargets };
        }
      }
      return null;
    });

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
    const errorMsg = err instanceof Error ? getErrorMessage(err) : "Migration failed";
    console.error({ route: "/api/admin/normalize-colleges", stage, error: errorMsg });
    return NextResponse.json({ success: false, stage, error: errorMsg }, { status: 500 });
  }
}
