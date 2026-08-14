import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];

    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
    
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
    const role = requesterDoc?.role;

    if (role !== "main_admin" && role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: Only main admins can clear all results" }, { status: 403 });
    }

    const { count } = await prisma.exam_results.deleteMany({});

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${count || 0} results.`,
      deletedCount: count || 0
    });
  } catch (error: any) {
    console.error("[clear-all-results] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
