import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token." }, { status: 401 });
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    const { collegeId, adminEmail, collegeName, password } = await request.json();

    if (!collegeId || typeof collegeId !== "string") {
      return NextResponse.json({ error: "College ID is required." }, { status: 400 });
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
      select: { role: true, collegeId: true } 
    });
    
    if (!requesterDoc) {
      return NextResponse.json({ error: "Admin user not found in database." }, { status: 403 });
    }

    const requesterRole = requesterDoc.role;
    const isSuperAdmin = ["admin", "trainer", "main_admin", "superadmin"].includes(requesterRole || "");
    const isOwnCollegeAdmin = requesterRole === "college_admin" && requesterDoc.collegeId === collegeId;
    
    if (!isSuperAdmin && !isOwnCollegeAdmin) {
      return NextResponse.json({ error: "Only admins or trainers can update college authentication details." }, { status: 403 });
    }

    if (!adminEmail && !collegeName && !password) {
      return NextResponse.json(
        { error: "At least one update parameter (adminEmail, collegeName, password) must be provided." },
        { status: 400 }
      );
    }

    const collegeDocSnap = await prisma.colleges.findUnique({ where: { id: collegeId }, select: { id: true, adminEmail: true } });
    if (!collegeDocSnap) {
      return NextResponse.json({ error: "College not found." }, { status: 404 });
    }
    const currentAdminEmail = collegeDocSnap.adminEmail;
    
    let prismaUserId: string | null = null;
    let supabaseUid: string | null = null;
    
    if (currentAdminEmail) {
      // Find the user ID in the users table by email and collegeId
      const usersSnap = await prisma.users.findFirst({ where: { email: currentAdminEmail, collegeId: collegeId }, select: { id: true, authId: true } });
      if (usersSnap) {
        prismaUserId = usersSnap.id;
        supabaseUid = usersSnap.authId || usersSnap.id;
      }
    }
    
    // Fallback: search users collection for college_admin role with this collegeId
    if (!prismaUserId) {
      const usersSnap = await prisma.users.findFirst({
        where: { collegeId: collegeId, role: "college_admin" },
        select: { id: true, authId: true }
      });
        
      if (usersSnap) {
        prismaUserId = usersSnap.id;
        supabaseUid = usersSnap.authId || usersSnap.id;
      }
    }

    const authUpdateFields: Record<string, any> = {};
    if (adminEmail) {
      const normalizedEmail = (adminEmail as string).toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
      }

      // Check for email uniqueness — but ONLY against OTHER entities, not self
      const [emailCollege, emailUser, emailStudent] = await Promise.all([
        prisma.colleges.findFirst({ where: { adminEmail: normalizedEmail, id: { not: collegeId } }, select: { id: true } }),
        prismaUserId 
          ? prisma.users.findFirst({ where: { email: normalizedEmail, id: { not: prismaUserId } }, select: { id: true } }) 
          : prisma.users.findFirst({ where: { email: normalizedEmail }, select: { id: true } }),
        prismaUserId 
          ? prisma.students.findFirst({ where: { users: { email: normalizedEmail }, id: { not: prismaUserId } }, select: { id: true } }) 
          : prisma.students.findFirst({ where: { users: { email: normalizedEmail } }, select: { id: true } })
      ]);
      
      const emailExists = emailUser || emailStudent || emailCollege;
                          
      if (emailExists) {
        return NextResponse.json(
          { error: "Update failed: This email address is already in use by another account in the system.", errorCode: "database/email-already-exists" },
          { status: 409 }
        );
      }

      authUpdateFields.email = normalizedEmail;
    }

    if (collegeName || collegeId) {
      const updatedMeta: any = { role: "college_admin", collegeId };
      if (collegeName) {
        updatedMeta.full_name = `${(collegeName as string).trim()} Admin`;
      }
      authUpdateFields.user_metadata = updatedMeta;
    }
    if (password) {
      authUpdateFields.password = password as string;
    }

    // If an existing admin account exists, UPDATE it
    if (supabaseUid && Object.keys(authUpdateFields).length > 0) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(supabaseUid, authUpdateFields);
      if (authErr) {
        if (authErr.message.includes("email already exists") || authErr.message.includes("unique") || authErr.message.includes("already been registered")) {
          return NextResponse.json(
            { error: "Update failed: This admin email is already in use by another account.", errorCode: "auth/email-already-exists" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: authErr.message || "Failed to update College Admin Auth account." },
          { status: 500 }
        );
      }
    }
    
    // If NO existing admin account, CREATE a new Supabase Auth user for this college
    if (!supabaseUid && adminEmail) {
      const normalizedEmail = (adminEmail as string).toLowerCase().trim();
      const defaultPassword = password || `College@${collegeId.slice(0, 6)}2024`;
      
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          full_name: collegeName ? `${(collegeName as string).trim()} Admin` : `${collegeId} Admin`,
          role: "college_admin",
          collegeId: collegeId
        }
      });

      if (createErr) {
        console.error("Failed to create college admin auth user:", createErr);
        return NextResponse.json(
          { error: createErr.message || "Failed to create College Admin Auth account." },
          { status: 500 }
        );
      }
      supabaseUid = newUser.user.id;
      if (!prismaUserId) prismaUserId = newUser.user.id;
    }

    // Update College Document
    const collegeUpdates: Record<string, any> = {};
    if (adminEmail) collegeUpdates.adminEmail = adminEmail.toLowerCase().trim();
    if (collegeName) collegeUpdates.name = collegeName.trim().toLowerCase();
    
    if (Object.keys(collegeUpdates).length > 0) {
      await prisma.colleges.update({ where: { id: collegeId }, data: collegeUpdates });
    }

    // Update or Create User Document for the college admin
    if (prismaUserId) {
      const userUpdates: Record<string, any> = {
        role: "college_admin",
        collegeId: collegeId,
      };
      if (adminEmail) userUpdates.email = adminEmail.toLowerCase().trim();
      if (collegeName) {
        userUpdates.displayName = `${(collegeName as string).trim()} Admin`;
      }
      
      // UPSERT the user record
      await prisma.users.upsert({ 
        where: { id: prismaUserId }, 
        update: userUpdates, 
        create: { 
          id: prismaUserId, 
          authId: supabaseUid, 
          displayName: userUpdates.displayName || `${collegeId} Admin`,
          ...userUpdates 
        } as any 
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Update college auth endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error.", details: (err as { message?: string })?.message || String(err) },
      { status: 500 }
    );
  }
}
