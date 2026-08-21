import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const generateSecurePassword = () => process.env.DEFAULT_STUDENT_PASSWORD || "Welcome@123";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token." }, { status: 401 });
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    const { uid, email, password, role, collegeId, status } = await request.json();

    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "User ID (uid) is required." }, { status: 400 });
    }

    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);
    
    if (verifyError || !adminUser) {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    // Check that the requester has an admin/trainer role
    const requesterUid = adminUser.id;
    const requesterDoc = await prisma.users.findFirst({ 
      where: { 
        OR: [
          { id: requesterUid },
          { authId: requesterUid },
          ...(adminUser.email ? [{ email: { equals: adminUser.email.toLowerCase().trim(), mode: "insensitive" as const } }] : [])
        ]
      }, 
      select: { role: true } 
    });
    
    if (!requesterDoc) {
      return NextResponse.json({ error: "Admin user not found in database." }, { status: 403 });
    }

    const requesterRole = requesterDoc.role;
    if (requesterRole !== "admin" && requesterRole !== "trainer" && requesterRole !== "college" && requesterRole !== "college_admin" && requesterRole !== "superadmin" && requesterRole !== "main_admin") {
      return NextResponse.json({ error: "Only admin, trainer, or college roles can update student auth." }, { status: 403 });
    }

    // Validate that at least one update parameter is provided
    if (!email && !password && !role && !collegeId && status === undefined) {
      return NextResponse.json(
        { error: "At least one update parameter (email, password, role, collegeId, status) must be provided." },
        { status: 400 }
      );
    }

    // Build the Auth update payload
    const authUpdateFields: Record<string, any> = {};
    if (status === 'restricted') {
      authUpdateFields.ban_duration = '876000h';
    } else if (status === 'active') {
      authUpdateFields.ban_duration = 'none';
    }
    if (email) {
      const normalizedEmail = (email as string).toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
      }

      // Check for email uniqueness in Prisma tables
      const emailUser = await prisma.users.findFirst({ 
        where: { 
          email: normalizedEmail, 
          id: { not: uid } 
        }, 
        select: { id: true } 
      });
      
      if (emailUser) {
        return NextResponse.json(
          { error: "Update failed: This email address is already in use by another account in the system.", errorCode: "database/email-already-exists" },
          { status: 409 }
        );
      }

      authUpdateFields.email = normalizedEmail;
    }
    if (password) {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters." },
          { status: 400 }
        );
      }
      authUpdateFields.password = password;
    }

    let authUid = uid;
    const studentUserDoc = await prisma.users.findUnique({ where: { id: uid }, select: { authId: true } });
    if (studentUserDoc && studentUserDoc.authId) {
      authUid = studentUserDoc.authId;
    }

    const isAuthUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUid);

    // Update the Auth user metadata if needed
    if ((role || collegeId) && isAuthUuid) {
      try {
        const { data: userRecord } = await supabaseAdmin.auth.admin.getUserById(authUid);
        const currentMeta = userRecord?.user?.user_metadata || {};
        const updatedMeta = { ...currentMeta };
        if (role) updatedMeta.role = role;
        if (collegeId) updatedMeta.collegeId = collegeId;
        authUpdateFields.user_metadata = updatedMeta;
      } catch (e) {
        console.warn("Failed to fetch Supabase user metadata:", e);
      }
    }

    // Update the Supabase Auth user
    if (Object.keys(authUpdateFields).length > 0 && isAuthUuid) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(authUid, authUpdateFields);

      if (authUpdateError) {
        if (authUpdateError.message.includes("email already exists") || authUpdateError.message.includes("unique") || authUpdateError.message.includes("already been registered")) {
          return NextResponse.json(
            { error: "Update failed: This email address is already in use by another account.", errorCode: "auth/email-already-exists" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: authUpdateError.message || "Failed to update Supabase Auth account." },
          { status: 500 }
        );
      }
    }

    // Sync email and other fields to database users and students table
    const userUpdates: Record<string, any> = {};
    const studentUpdates: Record<string, any> = {};

    if (email) {
      const normalizedEmail = (email as string).toLowerCase().trim();
      userUpdates.email = normalizedEmail;
      // email is not in students Prisma model
    }

    if (role) userUpdates.role = role;
    if (status !== undefined) userUpdates.status = status;
    if (collegeId) {
      userUpdates.collegeId = collegeId;
      studentUpdates.collegeId = collegeId;
    }

    // When password is updated, clear mustChangePassword flag
    if (password) {
      studentUpdates.mustChangePassword = false;
    }

    if (Object.keys(userUpdates).length > 0) {
      await prisma.users.updateMany({ where: { id: uid }, data: userUpdates });
    }
    
    if (Object.keys(studentUpdates).length > 0) {
      await prisma.students.updateMany({ where: { id: uid }, data: studentUpdates });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Update student auth endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: (err as { message?: string })?.message || String(err) },
      { status: 500 }
    );
  }
}