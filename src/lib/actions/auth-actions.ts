"use server";

import { prisma } from '@/lib/prisma';
import { createClient } from "@supabase/supabase-js";

const isUUID = (str?: string | null): boolean => 
  Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

export async function syncGoogleUserAction(authUser: any, mode: "login" | "register" = "login") {
  if (!authUser || !authUser.id) {
    throw new Error("Invalid auth user payload");
  }

  const email = (authUser.email || "").toLowerCase().trim();
  const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split("@")[0] || "Student";
  const uid = authUser.id;

  let existingUser = await prisma.users.findFirst({
    where: {
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        { authId: uid },
        { id: uid }
      ]
    },
    include: { colleges: true }
  });

  let existingStudent = await prisma.students.findFirst({
    where: {
      OR: [
        { users: { email: { equals: email, mode: "insensitive" } } },
        { authId: uid },
        { id: uid }
      ]
    },
    include: { users: true, colleges: true }
  });

  if (existingUser?.status === "restricted" || existingStudent?.users?.status === "restricted") {
    return { error: "restricted" };
  }
  if (existingUser?.status === "deleted" || existingStudent?.users?.status === "deleted") {
    return { error: "account_deleted" };
  }

  // If registering from the Registration page and the account already exists, reject!
  if (mode === "register" && (existingUser || existingStudent)) {
    return { error: "already_registered" };
  }

  // Link authId to existing user/student
  if (existingUser && (!existingUser.authId || existingUser.authId !== uid)) {
    await prisma.users.update({
      where: { id: existingUser.id },
      data: { authId: uid }
    }).catch(() => {});
  }

  if (existingStudent && (!existingStudent.authId || existingStudent.authId !== uid)) {
    await prisma.students.update({
      where: { id: existingStudent.id },
      data: { authId: uid }
    }).catch(() => {});
  }

  // If brand new student logging in with Google
  if (!existingUser && !existingStudent) {
    const studentId = `stud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newUser = await prisma.users.create({
      data: {
        id: studentId,
        authId: uid,
        email: email,
        displayName: name,
        role: "student",
        status: "active",
        collegeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    const newStudent = await prisma.students.create({
      data: {
        id: studentId,
        authId: uid,
        department: "Computer Science & Engineering",
        academicYear: "1st Year",
        section: "A",
        collegeId: null,
        enrollmentType: "self",
        rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });

    existingUser = newUser as any;
    existingStudent = newStudent as any;
  }

  const role = existingUser?.role || "student";
  const collegeId = existingUser?.collegeId || existingStudent?.collegeId || null;
  const collegeName = existingUser?.colleges?.name || (existingStudent as any)?.colleges?.name || null;

  const userProfile = {
    id: existingUser?.id || uid,
    name: existingUser?.displayName || name,
    email: email,
    role: role,
    collegeId: collegeId,
    collegeName: collegeName,
    department: existingStudent?.department || "General",
    section: existingStudent?.section || "A",
    academicYear: existingStudent?.academicYear || "1st Year",
    createdAt: Date.now()
  };

  return {
    success: true,
    role,
    userProfile,
    targetPath: role === "student" ? "/student" : (role === "college_admin" ? "/" : "/admin")
  };
}

export async function getAuthProfileDataAction(authId: string) {
  const userOrConditions: any[] = [{ id: authId }];
  if (isUUID(authId)) {
    userOrConditions.push({ authId });
  }

  const profile = await prisma.users.findFirst({
    where: { 
      OR: userOrConditions
    },
    include: { colleges: true }
  });

  if (!profile) {
    const studentOrConditions: any[] = [{ id: authId }];
    if (isUUID(authId)) {
      studentOrConditions.push({ authId });
    }
    const studentDoc = await prisma.students.findFirst({
      where: { OR: studentOrConditions },
      include: { colleges: true }
    });
    if (studentDoc) {
      return { 
        profile: null, 
        studentDoc: JSON.parse(JSON.stringify(studentDoc)), 
        collegeStatus: studentDoc.colleges?.status || null 
      };
    }
    return { profile: null, studentDoc: null, collegeStatus: null };
  }

  let studentDoc = null;
  if (profile.role === "student") {
    const studentOrConditions: any[] = [{ id: profile.id }];
    if (isUUID(authId)) {
      studentOrConditions.push({ authId });
    }
    if (isUUID(profile.id)) {
      studentOrConditions.push({ authId: profile.id });
    }

    studentDoc = await prisma.students.findFirst({
      where: { 
        OR: studentOrConditions
      },
      include: { colleges: true }
    });
  }

  const collegeStatus = profile.colleges?.status || studentDoc?.colleges?.status || null;

  return { 
    profile: JSON.parse(JSON.stringify(profile)), 
    studentDoc: studentDoc ? JSON.parse(JSON.stringify(studentDoc)) : null, 
    collegeStatus 
  };
}

export async function clearMustChangePasswordAction(authId: string) {
  // mustChangePassword only exists on the `students` table, NOT on `users`
  const orConditions: any[] = [{ id: authId }];
  if (isUUID(authId)) {
    orConditions.push({ authId });
  }

  await prisma.students.updateMany({
    where: { 
      OR: orConditions
    },
    data: { mustChangePassword: false, updatedAt: new Date() }
  });
}

export async function checkEmailExistsAction(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return false;

  // 1. Check PostgreSQL users table
  const existingUser = await prisma.users.findFirst({
    where: { email: { equals: cleanEmail, mode: "insensitive" } }
  });
  if (existingUser) return true;

  // 2. Check Supabase Auth
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rramkmudzrxaipukueuq.supabase.co";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const authFound = listData?.users?.some((u: any) => u.email?.toLowerCase() === cleanEmail);
    if (authFound) return true;
  } catch (e) {
    console.error("Error checking auth email exists:", e);
  }

  return false;
}

export async function studentRegisterServerAction(payload: {
  fullName: string;
  email: string;
  password: string;
  collegeName: string;
  department?: string;
  section?: string;
}) {
  const { fullName, email, password, collegeName, department = "Computer Science & Engineering", section = "A" } = payload;
  const cleanEmail = email.toLowerCase().trim();

  // 1. Strict check: reject if email already registered in DB
  const existingUser = await prisma.users.findFirst({
    where: { email: { equals: cleanEmail, mode: "insensitive" } }
  });
  if (existingUser) {
    throw new Error("This email is already registered. Please sign in instead.");
  }

  // 2. Initialize Supabase Admin client with service role key
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rramkmudzrxaipukueuq.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 3. Create pre-confirmed user in Supabase Auth
  const { data: createRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password: password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim() }
  });

  if (createErr) {
    if (createErr.message?.toLowerCase().includes("already") || createErr.status === 422) {
      throw new Error("An account with this email address already exists. Please sign in instead.");
    }
    throw new Error(createErr.message || "Failed to create authentication user.");
  }

  const authUser = createRes.user;
  const uid = authUser.id;

  // 3. Resolve or Create College
  let collegeId: string | null = null;
  if (collegeName.trim()) {
    const existingCollege = await prisma.colleges.findFirst({
      where: {
        OR: [
          { name: { equals: collegeName.trim(), mode: "insensitive" } },
          { id: collegeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "") }
        ]
      }
    });

    if (existingCollege) {
      collegeId = existingCollege.id;
    } else {
      const newColId = `col-${collegeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "") || Date.now()}`;
      const createdCol = await prisma.colleges.create({
        data: {
          id: newColId,
          name: collegeName.trim(),
          code: (collegeName.substring(0, 6) || "COLL").toUpperCase(),
          departments: [department || "General"],
          status: "active",
          type: "external"
        }
      }).catch(() => null);
      if (createdCol) collegeId = createdCol.id;
    }
  }

  // 4. Atomic PostgreSQL record upsert
  const sanitizedUser = {
    id: uid,
    authId: uid,
    email: cleanEmail,
    displayName: fullName.trim(),
    role: "student",
    status: "active",
    collegeId: collegeId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sanitizedStudent = {
    id: uid,
    authId: uid,
    collegeId: collegeId,
    department: department || "General",
    academicYear: "1st Year",
    semester: 1,
    section: section || "A",
    rollNumber: `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
    enrollmentType: "self",
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await prisma.$transaction(async (tx: any) => {
    await tx.users.upsert({
      where: { id: sanitizedUser.id },
      create: sanitizedUser,
      update: sanitizedUser,
    });
    await tx.students.upsert({
      where: { id: sanitizedStudent.id },
      create: sanitizedStudent,
      update: sanitizedStudent,
    });
  });

  return { 
    user: JSON.parse(JSON.stringify(authUser)), 
    uid, 
    collegeId,
    success: true 
  };
}

export async function registerStudentDocsAction(userDoc: any, studentDoc: any) {
  let collegeId = userDoc.collegeId || studentDoc.collegeId || null;
  const collegeName = userDoc.collegeName || studentDoc.collegeName || "";

  if (collegeName && (!collegeId || collegeId === "col-unassigned")) {
    const existingCollege = await prisma.colleges.findFirst({
      where: {
        OR: [
          { name: { equals: collegeName.trim(), mode: "insensitive" } },
          { id: collegeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "") }
        ]
      }
    });

    if (existingCollege) {
      collegeId = existingCollege.id;
    } else {
      const newColId = `col-${collegeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "") || Date.now()}`;
      const createdCol = await prisma.colleges.create({
        data: {
          id: newColId,
          name: collegeName.trim(),
          code: (collegeName.substring(0, 6) || "COLL").toUpperCase(),
          departments: [studentDoc.department || "General"],
          status: "active",
          type: "external"
        }
      }).catch(() => null);
      if (createdCol) collegeId = createdCol.id;
    }
  }

  const sanitizedUser = {
    id: userDoc.id,
    authId: isUUID(userDoc.authId) ? userDoc.authId : (isUUID(userDoc.id) ? userDoc.id : null),
    email: (userDoc.email || "").toLowerCase().trim(),
    displayName: userDoc.displayName || userDoc.name || "Student",
    role: "student",
    status: "active",
    collegeId: collegeId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sanitizedStudent = {
    id: userDoc.id,
    authId: isUUID(studentDoc.authId) ? studentDoc.authId : (isUUID(userDoc.id) ? userDoc.id : null),
    collegeId: collegeId,
    department: studentDoc.department || "General",
    academicYear: studentDoc.academicYear || "1st Year",
    semester: studentDoc.semester || 1,
    section: studentDoc.section || "A",
    rollNumber: studentDoc.rollNumber || `ROLL-${Math.floor(1000 + Math.random() * 9000)}`,
    enrollmentType: "self",
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await prisma.$transaction(async (tx: any) => {
    await tx.users.upsert({
      where: { id: sanitizedUser.id },
      create: sanitizedUser,
      update: sanitizedUser,
    });
    await tx.students.upsert({
      where: { id: sanitizedStudent.id },
      create: sanitizedStudent,
      update: sanitizedStudent,
    });
  });
}

export async function getStudentByIdAction(id: string) {
  if (!id) return null;
  const orConditions: any[] = [{ id }];
  if (isUUID(id)) {
    orConditions.push({ authId: id });
  }

  if (id.includes("@")) {
    orConditions.push({ users: { email: id.toLowerCase().trim() } });
  } else {
    orConditions.push({
      users: {
        OR: [
          { id },
          ...(isUUID(id) ? [{ authId: id }] : [])
        ]
      }
    });
  }

  const data = await prisma.students.findFirst({ 
    where: { 
      OR: orConditions
    },
    include: { users: true, colleges: true }
  });
  return data ? JSON.parse(JSON.stringify(data)) : null;
}

export async function getUserByIdAction(id: string) {
  if (!id) return null;
  const orConditions: any[] = [{ id }];
  if (isUUID(id)) {
    orConditions.push({ authId: id });
  }
  if (id.includes("@")) {
    orConditions.push({ email: id.toLowerCase().trim() });
  }

  const data = await prisma.users.findFirst({ 
    where: { 
      OR: orConditions
    },
    include: { colleges: true }
  });
  return data ? JSON.parse(JSON.stringify(data)) : null;
}

export async function getCollegeAdminsAction(collegeId: string) {
  const data = await prisma.users.findMany({ where: { collegeId, role: 'college_admin' } });
  return JSON.parse(JSON.stringify(data));
}
