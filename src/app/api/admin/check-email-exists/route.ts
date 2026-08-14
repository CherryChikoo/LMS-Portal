import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const adminIdToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;

    const { email } = await request.json();

    if (!adminIdToken || typeof adminIdToken !== "string") {
      return NextResponse.json({ error: "Admin authorization token is required." }, { status: 401 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Verify admin
    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);
    
    if (verifyError || !adminUser) {
      return NextResponse.json({ error: "Invalid or expired admin session." }, { status: 401 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for active users
    const activeUser = await prisma.users.findFirst({
      where: { email: normalizedEmail },
      select: { id: true }
    });
    
    if (activeUser) {
      return NextResponse.json({
        exists: true,
        uid: activeUser.id,
        provider: "supabase",
        reason: "active_user"
      });
    }
    
    // Check for active colleges with this admin email
    const activeCollege = await prisma.colleges.findFirst({
      where: { 
        adminEmail: normalizedEmail,
        status: { not: "deleted" }
      },
      select: { id: true }
    });
      
    if (activeCollege) {
      return NextResponse.json({
        exists: true,
        uid: activeCollege.id,
        provider: "supabase",
        reason: "college_admin"
      });
    }
    
    // Check for active students
    const activeStudent = await prisma.students.findFirst({
      where: {
        users: { email: normalizedEmail }
      },
      select: { id: true }
    });
      
    if (activeStudent) {
      return NextResponse.json({
        exists: true,
        uid: activeStudent.id,
        provider: "supabase",
        reason: "student"
      });
    }

    // Check if email exists in Supabase Auth
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = usersData?.users?.find(u => u.email === normalizedEmail);
      
      if (existingUser) {
        return NextResponse.json({
          exists: true,
          uid: existingUser.id,
          provider: "supabase"
        });
      } else {
        return NextResponse.json({ exists: false });
      }
    } catch (err: unknown) {
      throw err;
    }
  } catch (err: unknown) {
    console.error("Check email exists error:", err);
    return NextResponse.json(
      { error: "Failed to check email existence.", details: (err as any)?.message || String(err) },
      { status: 500 }
    );
  }
}
