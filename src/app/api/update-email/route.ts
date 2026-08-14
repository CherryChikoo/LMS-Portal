import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { idToken, newEmail } = await request.json();

    if (!idToken || !newEmail) {
      return NextResponse.json(
        { error: "Missing idToken or newEmail" },
        { status: 400 }
      );
    }

    const cleanEmail = (newEmail as string).toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(idToken);
    
    if (verifyError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired session. Please sign in again." },
        { status: 401 }
      );
    }

    const uid = user.id;

    // 1. Explicit Auth Update with Collision Protection
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(uid, { email: cleanEmail });
    
    if (authError) {
      if (authError.message.includes("already exists") || authError.message.includes("unique")) {
        return NextResponse.json(
          { error: "Update failed: This email address is already in use by another account.", errorCode: "auth/email-already-exists" },
          { status: 409 }
        );
      }
      console.error("Admin updateUser error:", authError);
      return NextResponse.json(
        { error: authError.message || "Failed to update Supabase Auth user." },
        { status: 500 }
      );
    }

    // 2. Database Sync
    try {
      await prisma.users.update({ where: { id: uid }, data: { email: cleanEmail } });
      // students table does not have email column in Prisma schema

      // If this user is a college_admin, update their college document adminEmail as well
      const userDoc = await prisma.users.findUnique({ where: { id: uid }, select: { collegeId: true } });
      if (userDoc?.collegeId) {
        await prisma.colleges.update({ where: { id: userDoc.collegeId }, data: { adminEmail: cleanEmail } });
      }

    } catch (dbErr: unknown) {
      console.error("[CRITICAL SYNC FAILURE] Auth email updated successfully, but database update failed:", dbErr);
      return NextResponse.json(
        {
          success: true,
          warning: "Email updated in Auth, but Database sync encountered an issue.",
          details: getErrorMessage(dbErr),
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, uid, email: cleanEmail });
  } catch (error: unknown) {
    console.error("Admin update email root error:", error);

    if ((error as any)?.message?.includes("already exists")) {
      return NextResponse.json(
        { error: "Update failed: This email address is already in use by another account.", errorCode: "auth/email-already-exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to update email" },
      { status: 500 }
    );
  }
}
