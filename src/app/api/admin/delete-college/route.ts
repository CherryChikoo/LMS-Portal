import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { bulkDeleteByQuery, deleteDocumentAdmin, deleteStorageDirectory } from '@/lib/services/cleanup-service';

const DeleteCollegeSchema = z.object({
  id: z.string().min(1, "College ID is required."),
  collegeName: z.string().optional(),
}).strict();

/**
 * Helper function to delete ALL documents (exams/resources) related to a college.
 * Checks multiple fields:
 * 1. Direct collegeId field
 * 2. Direct collegeName field  
 * 3. targets array (targets[0].collegeId or targets[0].collegeName)
 * 
 * Processes in batches to avoid memory issues.
 */
async function deleteAllCollegeContent(
  db: ReturnType<typeof getFirestore>,
  collectionName: string,
  collegeId: string,
  collegeName?: string
): Promise<number> {
  let deletedCount = 0;
  const BATCH_SIZE = 500;
  
  console.log(`[DeleteCollege] Scanning ${collectionName} for college ${collegeId} (${collegeName})...`);
  
  // Fetch ALL documents in batches and check them
  let lastDoc: any = null;
  let hasMore = true;

  while (hasMore) {
    let query = db.collection(collectionName)
      .orderBy('__name__')
      .limit(BATCH_SIZE);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const bulkWriter = db.bulkWriter();
    bulkWriter.onWriteError((error) => {
      if (error.failedAttempts < 3) return true;
      console.error(`[DeleteCollege] BulkWriter error for ${collectionName}:`, error);
      return false;
    });

    // Check each document
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      let shouldDelete = false;
      
      // Check 1: Direct collegeId match
      if (data.collegeId === collegeId) {
        shouldDelete = true;
      }
      
      // Check 2: Direct collegeName match
      if (!shouldDelete && collegeName && data.collegeName) {
        const normalizedName = String(data.collegeName).toLowerCase().trim();
        const normalizedTarget = collegeName.toLowerCase().trim();
        if (normalizedName === normalizedTarget) {
          shouldDelete = true;
        }
      }
      
      // Check 3: targets array (targets[0].collegeId or targets[0].collegeName)
      if (!shouldDelete && Array.isArray(data.targets) && data.targets.length > 0) {
        const hasCollegeInTargets = data.targets.some((t: any) => {
          // Check collegeId in targets
          if (t && typeof t === 'object' && t.collegeId === collegeId) {
            return true;
          }
          // Check collegeName in targets
          if (t && typeof t === 'object' && collegeName && t.collegeName) {
            const tName = String(t.collegeName).toLowerCase().trim();
            const targetName = collegeName.toLowerCase().trim();
            return tName === targetName;
          }
          // Check if target is just a string (collegeId)
          if (typeof t === 'string' && t === collegeId) {
            return true;
          }
          return false;
        });
        
        if (hasCollegeInTargets) {
          shouldDelete = true;
        }
      }
      
      if (shouldDelete) {
        bulkWriter.delete(doc.ref);
        deletedCount++;
      }
    });

    await bulkWriter.close();

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    hasMore = snapshot.docs.length === BATCH_SIZE;
  }

  console.log(`[DeleteCollege] ✅ Deleted ${deletedCount} ${collectionName} documents for college ${collegeId}`);
  return deletedCount;
}

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, stage, errorCode: "unauthenticated", message: "Missing or invalid authorization token." }, { status: 401 });
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    stage = "verifyAdminToken";
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err: unknown) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-token", message: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    stage = "verifyAdminRole";
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data()?.role : undefined;
    
    if (requesterRole !== "main_admin" && requesterRole !== "admin" && requesterRole !== "trainer") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Only admin or trainer roles can delete colleges." }, { status: 403 });
    }

    stage = "validatePayload";
    const body = await request.json().catch(() => ({}));
    const parseResult = await DeleteCollegeSchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: parseResult.error.issues[0].message }, { status: 400 });
    }
    const { id: collegeId } = parseResult.data;

    stage = "gatherAuthUids";
    const authUidsToDelete = new Set<string>();
    
    // OPTIMIZATION: Parallelize independent queries
    const [collegeDoc, usersSnap, studentsSnap] = await Promise.all([
      db.collection("colleges").doc(collegeId).get(),
      db.collection("users").where("collegeId", "==", collegeId).get(),
      db.collection("students").where("collegeId", "==", collegeId).get()
    ]);
    
    // Add college admin emails (from the college doc)
    // CRITICAL: Only delete if role is college_admin
    if (collegeDoc.exists) {
      const adminEmail = collegeDoc.data()?.adminEmail;
      if (adminEmail) {
        try {
          const u = await auth.getUserByEmail(adminEmail.toLowerCase().trim());
          // Check role before deleting
          const userDoc = await db.collection("users").doc(u.uid).get();
          const userRole = userDoc.exists ? userDoc.data()?.role : null;
          
          // ONLY delete college_admin, never delete main_admin/admin/trainer/superadmin
          if (userRole === 'college_admin') {
            authUidsToDelete.add(u.uid);
          } else {
            console.log(`[DeleteCollege] Skipping deletion of protected role: ${userRole} (${adminEmail})`);
          }
        } catch (_) {
          // Admin email not found in Auth - skip
        }
      }
    }

    // Gather user UIDs - ONLY college_admin and student roles
    // CRITICAL: Never delete main_admin/admin/trainer/superadmin accounts
    usersSnap.docs.forEach(doc => {
      const data = doc.data();
      const role = data?.role;
      
      // Only delete non-protected roles
      if (role === 'college_admin' || role === 'student' || !role) {
        authUidsToDelete.add(doc.id);
      } else {
        console.log(`[DeleteCollege] Skipping deletion of protected role: ${role} (${doc.id})`);
      }
    });
    
    // Students are always safe to delete
    studentsSnap.docs.forEach(doc => authUidsToDelete.add(doc.id));

    stage = "deleteAuthAccounts";
    const uidsArray = Array.from(authUidsToDelete);
    if (uidsArray.length > 0) {
      try {
        await auth.deleteUsers(uidsArray);
      } catch (err: any) {
        console.warn(`[CleanupService] Some Auth accounts failed to delete: ${err.message}`);
      }
    }

    stage = "fetchExamAndStudentDependencies";
    const examsSnap = await db.collection("exams").where("collegeId", "==", collegeId).get();
    const examIds = examsSnap.docs.map(doc => doc.id);

    stage = "cascadingDelete";
    
    // Delete exam-related data first (results and questions)
    const bulkWriter = db.bulkWriter();
    bulkWriter.onWriteError((error) => {
      if (error.failedAttempts < 3) return true;
      console.error(`[DeleteCollege] BulkWriter failed after retries:`, error);
      return false;
    });

    // Parallelize exam results and questions deletion
    const examDeletionPromises = examIds.map(async (eId) => {
      const [eResSnap, qSnap] = await Promise.all([
        db.collection("exam_results").where("examId", "==", eId).get(),
        db.collection("questions").where("examId", "==", eId).get()
      ]);
      eResSnap.docs.forEach(doc => bulkWriter.delete(doc.ref));
      qSnap.docs.forEach(doc => bulkWriter.delete(doc.ref));
    });

    await Promise.all(examDeletionPromises);
    
    // Delete all exam_results for students in this college (chunked 'in' queries)
    if (uidsArray.length > 0) {
      const CHUNK_SIZE = 10;
      const studentResultPromises: Promise<void>[] = [];
      
      for (let i = 0; i < uidsArray.length; i += CHUNK_SIZE) {
        const chunk = uidsArray.slice(i, i + CHUNK_SIZE);
        const promise = db.collection("exam_results")
          .where("studentId", "in", chunk)
          .get()
          .then(chunkResSnap => {
            chunkResSnap.docs.forEach(doc => bulkWriter.delete(doc.ref));
          });
        studentResultPromises.push(promise);
      }
      
      await Promise.all(studentResultPromises);
    }
    
    await bulkWriter.close();

    // Get college name for comprehensive deletion
    let collegeName = parseResult.data.collegeName;
    if (!collegeName && collegeDoc.exists) {
      collegeName = collegeDoc.data()?.name;
    }

    // COMPREHENSIVE DELETION: Delete ALL content related to this college
    // This handles: direct collegeId, collegeName, and targets array
    stage = "deleteAllCollegeContent";
    console.log(`[DeleteCollege] Starting comprehensive deletion for ${collegeId} (${collegeName})...`);
    
    await Promise.all([
      deleteAllCollegeContent(db, "students", collegeId, collegeName),
      deleteAllCollegeContent(db, "users", collegeId, collegeName),
      deleteAllCollegeContent(db, "exams", collegeId, collegeName),
      deleteAllCollegeContent(db, "batches", collegeId, collegeName),
      deleteAllCollegeContent(db, "departments", collegeId, collegeName),
      deleteAllCollegeContent(db, "resources", collegeId, collegeName),
      deleteAllCollegeContent(db, "courses", collegeId, collegeName)
    ]);
    
    // Wipe nested student data (Dual Sweep) - OPTIMIZED with parallelization
    if (uidsArray.length > 0) {
      const studentBulkWriter = db.bulkWriter();
      studentBulkWriter.onWriteError((error) => {
        if (error.failedAttempts < 3) return true;
        console.error(`[DeleteCollege] StudentBulkWriter failed:`, error);
        return false;
      });

      const CHUNK_SIZE = 10;
      const nestedDataPromises: Promise<void>[] = [];
      
      for (let i = 0; i < uidsArray.length; i += CHUNK_SIZE) {
        const chunk = uidsArray.slice(i, i + CHUNK_SIZE);
        
        // Parallelize trainer_notes and doubts queries
        const promise = Promise.all([
          db.collection("trainer_notes").where("studentId", "in", chunk).get(),
          db.collection("doubts").where("studentId", "in", chunk).get()
        ]).then(([notesSnap, doubtsSnap]) => {
          notesSnap.docs.forEach(doc => studentBulkWriter.delete(doc.ref));
          doubtsSnap.docs.forEach(doc => studentBulkWriter.delete(doc.ref));
        });
        
        nestedDataPromises.push(promise);
      }
      
      await Promise.all(nestedDataPromises);
      await studentBulkWriter.close();
    }
    
    // 4. Delete college document itself
    await deleteDocumentAdmin("colleges", collegeId);

    // 5. Cloud Storage Garbage Collection
    stage = "deleteStorageFiles";
    await deleteStorageDirectory(`colleges/${collegeId}/`);

    return NextResponse.json({ 
      success: true, 
      message: "College and all associated data completely deleted.",
      purgedAuthAccounts: uidsArray.length
    });
  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
