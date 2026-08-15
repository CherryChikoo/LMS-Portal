import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
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
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    let adminIdToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;

    const body = await request.json();
    const { rows, enrollmentType = "csv" } = body;

    if (!adminIdToken && body.adminIdToken && typeof body.adminIdToken === "string") {
      adminIdToken = body.adminIdToken;
    }

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No student rows provided for import." }, { status: 400 });
    }

    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);
    
    if (verifyError || !adminUser) {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

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
    const requesterRole = requesterDoc?.role;

    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "college_admin" && requesterRole !== "main_admin" && requesterRole !== "superadmin") {
      return NextResponse.json({ error: "Only admin, trainer, or college roles can import students." }, { status: 403 });
    }

    console.time("[Supabase] Bulk Import Total");
    console.time("[Supabase] Bulk Import Pre-fetch Colleges");

    const uniqueCollegeNames = new Set<string>();
    (rows as ImportRowInput[]).forEach((r) => {
      const rawCol = String(r.college ?? "UNASSIGNED").trim();
      const normCol = rawCol.toLowerCase();
      if (normCol && normCol !== "unassigned") {
        uniqueCollegeNames.add(normCol);
      }
    });

    const collegeMap = new Map<string, { id: string; name: string; departments: Set<string>; initialDepsCount: number }>();

    // Fetch existing colleges matching names
    const namesArray = Array.from(uniqueCollegeNames);
    
    if (namesArray.length > 0) {
        // Chunk requests to avoid URL limits in PostgREST
        for(let i=0; i<namesArray.length; i+=100) {
            const chunk = namesArray.slice(i, i+100);
            // Search by exact name or ID (fallback)
            const cols = await prisma.colleges.findMany({ select: { id: true, name: true, departments: true } });
            if (cols) {
               cols.forEach((col: any) => {
                  const normName = (col.name || "").toLowerCase().trim();
                  const deps = new Set<string>(Array.isArray(col.departments) ? col.departments : []);
                  const entry = { id: col.id, name: col.name || formatCollegeTitle(normName), departments: deps, initialDepsCount: deps.size };
                  collegeMap.set(normName, entry);
                  collegeMap.set(col.id.toLowerCase().trim(), entry);
               });
            }
        }
    }
    
    console.timeEnd("[Supabase] Bulk Import Pre-fetch Colleges");

    const newCollegesToCreate = new Map<string, { id: string; name: string; departments: Set<string>; initialDepsCount: number }>();

    const RESERVED_COLLEGE_NAMES = new Set([
      "all", "all colleges", "all institutions", "select college", "select institution", "global",
      "default college", "unassigned", "none", "n/a", "na", "null", "undefined", "unknown",
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

    // Insert new colleges
    if (newCollegesToCreate.size > 0) {
      const collegesToInsert = Array.from(newCollegesToCreate.values()).map(col => {
        const safeCodeName = String(col.name || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
        return {
          id: col.id,
          name: col.name,
          code: safeCodeName || "COLLEGE",
          type: "registered",
          departments: Array.from(col.departments),
          origin: "trainer",
          status: "active"
        }
      });
      for (const col of collegesToInsert) {
        await prisma.colleges.upsert({
          where: { id: col.id },
          update: col,
          create: col
        });
      }
    }

    // Update departments for existing colleges
    const collegesToUpdate = Array.from(collegeMap.values()).filter(col => 
      !newCollegesToCreate.has(String(col.name || "").toLowerCase()) && col.departments.size > col.initialDepsCount
    );
    
    if (collegesToUpdate.length > 0) {
       await Promise.all(collegesToUpdate.map(col => 
         prisma.colleges.update({ where: { id: col.id }, data: { departments: Array.from(col.departments) } })
       ));
    }

    const summary = {
      total: (rows as ImportRowInput[]).length,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      duplicateCount: 0,
      results: [] as any[],
    };

    const items = rows as ImportRowInput[];
    const chunkEmails = items.map((r) => String(r.collegeEmail ?? "").toLowerCase().trim()).filter(Boolean);
    const existingEmailSet = new Set<string>();

    if (chunkEmails.length > 0) {
      for (let i = 0; i < chunkEmails.length; i += 100) {
        const subList = chunkEmails.slice(i, i + 100);
        const existing = await prisma.users.findMany({ where: { email: { in: subList } }, select: { email: true } });
        if (existing) {
          existing.forEach((d: any) => existingEmailSet.add(d.email.toLowerCase().trim()));
        }
      }
    }

    const CONCURRENT_BATCH_SIZE = 10;
    const processedResults: typeof summary.results = [];

    const newUsersToInsert = [];
    const newStudentsToInsert = [];

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
            const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { full_name: name, role: "student", collegeId: finalCollegeId }
            });

            if (authErr) {
              if (authErr.message.includes("already exists") || authErr.message.includes("unique")) {
                // Try to find the user
                const { data: users } = await supabaseAdmin.auth.admin.listUsers();
                const existingAuth = users?.users?.find(u => u.email === email);
                if (existingAuth) {
                   const userDoc = await prisma.users.findUnique({ where: { id: existingAuth.id }, select: { id: true } });
                   if (!userDoc) {
                      await supabaseAdmin.auth.admin.updateUserById(existingAuth.id, {
                        password: tempPassword,
                        user_metadata: { full_name: name, role: "student", collegeId: finalCollegeId }
                      });
                      uid = existingAuth.id;
                   } else {
                     return { name, email, password: "", status: "duplicate", reason: "Email already registered in database" };
                   }
                } else {
                   return { name, email, password: "", status: "failed", reason: "Auth verification error" };
                }
              } else {
                 return { name, email, password: "", status: "failed", reason: authErr.message || "Auth creation failed" };
              }
            } else {
              uid = authUser.user.id;
            }
          } catch (err: any) {
            return { name, email, password: "", status: "failed", reason: err.message || "Auth creation failed" };
          }

          existingEmailSet.add(email);
          return { 
            name, email, password: tempPassword, status: "created",
            uid, finalCollegeId, finalCollegeName, finalDepartment, finalAcademicYear, finalSection, finalBatch
          };
        })
      );

      for (const res of batchResults) {
        if (res.status === "created") {
          newUsersToInsert.push({
            id: res.uid,
            email: res.email,
            displayName: res.name,
            role: "student",
            collegeId: res.finalCollegeId,
            collegeName: res.finalCollegeName,
            department: res.finalDepartment,
            academicYear: res.finalAcademicYear,
            section: res.finalSection,
            batchIds: [res.finalBatch],
            mustChangePassword: true,
            initialPassword: res.password,
          });

          newStudentsToInsert.push({
            id: res.uid,
            name: res.name,
            email: res.email,
            collegeId: res.finalCollegeId,
            collegeName: res.finalCollegeName,
            department: res.finalDepartment,
            academicYear: res.finalAcademicYear,
            semester: 1,
            section: res.finalSection,
            rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
            batchIds: [res.finalBatch],
            mustChangePassword: true,
            initialPassword: res.password,
            enrollmentType: enrollmentType,
          });

          summary.createdCount++;
        } else if (res.status === "skipped") {
          summary.skippedCount++;
        } else if (res.status === "duplicate") {
          summary.duplicateCount++;
        } else {
          summary.failedCount++;
        }
        
        const cleanRes = { name: res.name, email: res.email, password: res.password, status: res.status, reason: (res as any).reason };
        processedResults.push(cleanRes);
      }
    }

    // Insert database docs in bulk
    if (newUsersToInsert.length > 0) {
      // Chunk to avoid payload size limit
      for (let i = 0; i < newUsersToInsert.length; i += 100) {
        const userBatch = newUsersToInsert.slice(i, i + 100);
        for (const u of userBatch) {
          const userDoc = {
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            role: u.role,
            collegeId: u.collegeId || null,
            authId: u.id
          };
          const userUpdateDoc = {
            email: u.email,
            displayName: u.displayName,
            role: u.role,
            collegeId: u.collegeId || null,
          };
          await prisma.users.upsert({ where: { id: u.id }, update: userUpdateDoc, create: userDoc as any });
        }
        
        const studentBatch = newStudentsToInsert.slice(i, i + 100);
        const batchAssignments: { studentId: string; batchId: string }[] = [];
        for (const s of studentBatch) {
          const { id, ...data } = s;
          // students doesn't have email in prisma schema, nor name!
          // Remove them from payload
          const { email, name, collegeName, initialPassword, mustChangePassword, batchIds, ...pureStudentData } = data as any;
          await prisma.students.upsert({ where: { id }, update: pureStudentData, create: { id, ...pureStudentData } });

          if (Array.isArray(batchIds) && batchIds.length > 0) {
            for (const bRaw of batchIds) {
              const batchName = typeof bRaw === "string" ? bRaw.trim() : "";
              if (!batchName || batchName === "General Cohort" || batchName === "Unassigned" || batchName === "None") continue;

              let matchedBatches = await prisma.batches.findMany({
                where: {
                  OR: [
                    { id: batchName },
                    { name: { equals: batchName, mode: "insensitive" } }
                  ]
                },
                select: { id: true, collegeId: true }
              });

              // Filter out batches belonging to a different college
              matchedBatches = matchedBatches.filter((b: any) => {
                if (!b.collegeId || b.collegeId === "GLOBAL" || b.collegeId === "global") return true;
                if (!pureStudentData.collegeId) return false;
                return b.collegeId.toLowerCase() === pureStudentData.collegeId.toLowerCase();
              });

              if (matchedBatches.length === 0) {
                const newBatchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                const created = await prisma.batches.create({
                  data: {
                    id: newBatchId,
                    name: batchName,
                    collegeId: pureStudentData.collegeId || null,
                    department: pureStudentData.department || null,
                    academicYear: pureStudentData.academicYear || null,
                    section: pureStudentData.section || null,
                  },
                  select: { id: true, collegeId: true }
                });
                matchedBatches = [created];
              }

              for (const mb of matchedBatches) {
                batchAssignments.push({ studentId: String(id), batchId: mb.id });
              }
            }
          }
        }
        if (batchAssignments.length > 0) {
          await prisma.student_batches.createMany({
            data: batchAssignments,
            skipDuplicates: true
          });
        }
      }
    }

    summary.results = processedResults;

    console.timeEnd("[Supabase] Bulk Import Total");
    return NextResponse.json({ success: true, summary });
  } catch (err: unknown) {
    console.error("Bulk import students endpoint error:", err);
    return NextResponse.json({ error: "Internal server error during bulk import.", details: (err as any)?.message || String(err) }, { status: 500 });
  }
}
