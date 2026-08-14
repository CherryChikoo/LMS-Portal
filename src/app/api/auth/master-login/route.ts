import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json().catch(() => ({}));

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Missing credentials" }, { status: 400 });
    }

    const masterEmail = process.env.MASTER_ADMIN_EMAIL;
    const masterPassword = process.env.MASTER_ADMIN_PASSWORD;

    if (!masterEmail || !masterPassword) {
      return NextResponse.json({ success: false, error: "Master login is not configured" }, { status: 501 });
    }

    if (email.toLowerCase().trim() === masterEmail.toLowerCase().trim() && password === masterPassword) {
      
      // Ensure master admin exists in Auth
      try {
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
        let masterUser = usersData?.users?.find(u => u.email === masterEmail);
        
        if (!masterUser) {
          const { data: newUser } = await supabaseAdmin.auth.admin.createUser({
            email: masterEmail,
            password: masterPassword,
            email_confirm: true,
            user_metadata: { role: "main_admin", full_name: "Master Admin" }
          });
          if (newUser.user) {
            masterUser = newUser.user;
          }
        } else {
          // Ensure role is set
          await supabaseAdmin.auth.admin.updateUserById(masterUser.id, {
            password: masterPassword, // Sync password just in case
            user_metadata: { role: "main_admin", full_name: "Master Admin" }
          });
        }
        
        if (masterUser) {
          const userDoc = {
            email: masterEmail.toLowerCase().trim(),
            displayName: "Master Admin",
            role: "main_admin",
            updatedAt: new Date()
          };
          await prisma.users.upsert({
            where: { id: masterUser.id },
            update: userDoc,
            create: { id: masterUser.id, ...userDoc }
          });
        }
        
        return NextResponse.json({ success: true, message: "Master account synchronized. Please login via standard UI." });
      } catch (err: unknown) {
        throw err;
      }
    }

    return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
  } catch (error) {
    console.error("[MASTER_LOGIN] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
