import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";


const generateSecurePassword = () => process.env.DEFAULT_STUDENT_PASSWORD || "Welcome@123";

function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

function collegeNameToId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const authHeader = request.headers.get("authorization");
    const adminIdToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;

    const body = await request.json().catch(() => ({}));
    const {
      email,
      name,
      collegeId,
      collegeName,
      department,
      academicYear,
      section,
      batch,
    } = body;

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json(
        { success: false, stage, errorCode: "auth/missing-token", message: "Admin authorization token is required." },
        { status: 401 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, stage, errorCode: "auth/invalid-email", message: "A valid student email address is required." },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, stage, errorCode: "invalid-argument", message: "A valid student name is required." },
        { status: 400 }
      );
    }

    stage = "verifyAdminToken";
    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);
    
    if (verifyError || !adminUser) {
      return NextResponse.json(
        { success: false, stage, errorCode: getErrorCode(verifyError), message: "Invalid or expired admin session.", details: getErrorMessage(verifyError) },
        { status: 401 }
      );
    }

    stage = "verifyAdminRole";
    const requesterUid = adminUser.id;
    const requesterDoc = await prisma.users.findFirst({ 
      where: { 
        OR: [
          { id: requesterUid },
          { authId: requesterUid }
        ]
      }, 
      select: { role: true } 
    });
    
    if (!requesterDoc) {
      return NextResponse.json(
        { success: false, stage, errorCode: "permission-denied", message: "Admin user not found in database." },
        { status: 403 }
      );
    }

    const requesterRole = requesterDoc.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "college_admin" && requesterRole !== "superadmin" && requesterRole !== "main_admin") {
      return NextResponse.json(
        { success: false, stage, errorCode: "permission-denied", message: "Only admin, trainer, or college roles can create student accounts." },
        { status: 403 }
      );
    }

    stage = "checkEmailUniqueness";
    const normalizedEmail = email.toLowerCase().trim();
    const studentName = name.trim();
    const finalCollegeName = (collegeName || "").trim().toLowerCase();
    const finalCollegeId = collegeId ? collegeId.trim() : collegeNameToId(finalCollegeName);
    const finalDepartment = (department || "Computer Science").trim();
    const finalAcademicYear = (academicYear || "1st Year").trim();
    const finalSection = (section || "A").toString().trim();
    const finalBatch = (batch || "").trim();

    // PRE-FLIGHT CHECK: Check if an active profile doc exists in Prisma for any role (students or users)
    const [existingUserRecord, existingStudent, existingCollege] = await Promise.all([
      prisma.users.findFirst({ where: { email: normalizedEmail }, select: { id: true } }),
      prisma.students.findFirst({ where: { users: { email: normalizedEmail } }, select: { id: true } }),
      prisma.colleges.findFirst({ where: { adminEmail: normalizedEmail }, select: { id: true } })
    ]);

    if (
      existingUserRecord || 
      existingStudent || 
      existingCollege
    ) {
      return NextResponse.json(
        {
          success: false, stage, errorCode: "database/email-already-exists",
          message: "An active account with this email address already exists in the system database.",
        },
        { status: 409 }
      );
    }

    stage = "createAuthUser";
    let authUser = null;
    let reusedExistingAccount = false;

    // Check if auth user exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === normalizedEmail);

    if (existingUser) {
      stage = "updateExistingAuthUser";
      const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password: generateSecurePassword(),
        user_metadata: { full_name: studentName, role: 'student', collegeId: finalCollegeId },
      });
      if (updateError) {
        return NextResponse.json(
          { success: false, stage, errorCode: getErrorCode(updateError), message: "Failed to update existing Auth account.", details: getErrorMessage(updateError), retryable: true },
          { status: 500 }
        );
      }
      authUser = updatedUser.user;
      reusedExistingAccount = true;
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: generateSecurePassword(),
        email_confirm: true,
        user_metadata: { full_name: studentName, role: 'student', collegeId: finalCollegeId },
      });

      if (createError) {
        return NextResponse.json(
          { success: false, stage, errorCode: getErrorCode(createError), message: "Failed to create Auth account.", details: getErrorMessage(createError), retryable: true },
          { status: 500 }
        );
      }
      authUser = newUser.user;
    }

    const uid = authUser.id;

    const userDoc = {
      id: uid,
      authId: uid,
      email: normalizedEmail,
      displayName: studentName,
      role: "student",
      collegeId: finalCollegeId,
    };

    const studentDoc = {
      id: uid,
      authId: uid,
      // name and email are not in students Prisma schema
      collegeId: finalCollegeId,
      // collegeName is not in Prisma schema
      department: finalDepartment,
      academicYear: finalAcademicYear,
      semester: 1,
      section: finalSection,
      rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
      // batchIds not in Prisma schema, student_batches needs to be used but we'll ignore for now
      mustChangePassword: true,
      enrollmentType: "manual",
    };

    stage = "createDatabaseDocuments";
    try {
      await prisma.$transaction([
        prisma.users.upsert({ where: { id: uid }, update: userDoc, create: userDoc }),
        prisma.students.upsert({ where: { id: uid }, update: studentDoc, create: studentDoc })
      ]);
      
      // Ensure the external college document exists
      if (finalCollegeId && finalCollegeId !== "col-unassigned") {
        const colSnap = await prisma.colleges.findUnique({ where: { id: finalCollegeId }, select: { id: true } });
        if (!colSnap) {
          await prisma.colleges.create({
            data: {
              id: finalCollegeId,
              name: finalCollegeName,
              code: finalCollegeId.substring(0, 6).toUpperCase(),
              type: "external",
            }
          });
        }
      }

      // Assign student to batch in student_batches
      if (finalBatch && finalBatch !== "Unassigned" && finalBatch !== "None" && finalBatch !== "General Cohort") {
        let matchingBatches = await prisma.batches.findMany({
          where: {
            OR: [
              { id: finalBatch },
              { name: { equals: finalBatch, mode: "insensitive" } }
            ]
          },
          select: { id: true, collegeId: true }
        });

        // Filter out batches that belong to a different college
        matchingBatches = matchingBatches.filter((b: any) => {
          if (!b.collegeId || b.collegeId === "GLOBAL" || b.collegeId === "global") return true;
          if (!finalCollegeId) return false;
          return b.collegeId.toLowerCase() === finalCollegeId.toLowerCase();
        });

        if (matchingBatches.length === 0) {
          const newBatchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const created = await prisma.batches.create({
            data: {
              id: newBatchId,
              name: finalBatch,
              collegeId: finalCollegeId || null,
              department: department || null,
              academicYear: academicYear || null,
              section: section || null,
            },
            select: { id: true, collegeId: true }
          });
          matchingBatches = [created];
        }

        if (matchingBatches.length > 0) {
          await prisma.student_batches.createMany({
            data: matchingBatches.map((b: any) => ({
              studentId: uid,
              batchId: b.id
            })),
            skipDuplicates: true
          });
        }
      }

    } catch (dbErr) {
      console.error("Failed to write student database documents:", dbErr);
      stage = "rollbackAuthUser";
      
      // Rollback of the Auth user if db write fails
      if (!reusedExistingAccount) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(uid);
        } catch (rollbackErr) {
          console.error("CRITICAL: Failed to rollback auth student creation after database error:", rollbackErr);
          return NextResponse.json(
            { success: false, stage, errorCode: getErrorCode(dbErr), message: "Failed to create student profile documents. Auth rollback also failed.", details: `DB Error: ${getErrorMessage(dbErr)} | Rollback Error: ${getErrorMessage(rollbackErr)}`, retryable: false },
            { status: 500 }
          );
        }
        return NextResponse.json(
          { success: false, stage, errorCode: getErrorCode(dbErr), message: "Failed to create student profile documents. Account creation was rolled back safely.", details: getErrorMessage(dbErr), retryable: true },
          { status: 500 }
        );
      } else {
        return NextResponse.json(
          { success: false, stage, errorCode: getErrorCode(dbErr), message: "Failed to create student profile documents.", details: getErrorMessage(dbErr), retryable: true },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      uid,
      email: normalizedEmail,
      initialPassword: generateSecurePassword(),
    });
  } catch (err) {
    console.error("Create student auth endpoint error:", err);
    return NextResponse.json(
      {
        success: false, stage: "unhandledException", errorCode: getErrorCode(err),
        message: "Internal server error.",
        details: getErrorMessage(err), retryable: true
      },
      { status: 500 }
    );
  }
}
