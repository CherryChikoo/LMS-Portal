import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteDocumentAdmin, deleteStorageFileByUrl } from '@/lib/services/cleanup-service';

const DeleteResourceSchema = z.object({
  id: z.string().min(1, "Resource ID is required."),
}).strict();

export async function POST(request: NextRequest) {
  let stage = "parseRequest";
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, stage, errorCode: "unauthenticated", message: "Missing or invalid authorization token." }, { status: 401 });
    }
    const adminIdToken = authHeader.split("Bearer ")[1];

    stage = "verifyAdminToken";
    const { data: { user: adminUser }, error: verifyError } = await supabaseAdmin.auth.getUser(adminIdToken);
    
    if (verifyError || !adminUser) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-token", message: "Invalid or expired admin session." }, { status: 401 });
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
    const requesterRole = requesterDoc?.role;
    
    if (requesterRole !== "main_admin" && requesterRole !== "admin" && requesterRole !== "college_admin" && requesterRole !== "trainer" && requesterRole !== "superadmin") {
      return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "Permission denied." }, { status: 403 });
    }

    stage = "validatePayload";
    const body = await request.json().catch(() => ({}));
    const parseResult = await DeleteResourceSchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-argument", message: parseResult.error.issues[0].message }, { status: 400 });
    }
    const { id: resourceId } = parseResult.data;

    stage = "fetchResource";
    const resourceDoc = await prisma.resources.findUnique({ where: { id: resourceId } });
    if (!resourceDoc) {
      return NextResponse.json({ success: false, stage, errorCode: "not-found", message: "Resource not found." }, { status: 404 });
    }

    const resourceData = resourceDoc;

    // BOLA Check: If college_admin, ensure they only delete their own college's resources
    if (requesterRole === "college_admin") {
      const requesterCollegeId = requesterDoc?.collegeId;
      if (resourceData?.collegeId !== requesterCollegeId) {
        return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "You can only delete resources belonging to your college." }, { status: 403 });
      }
    }

    stage = "deleteStorageFile";
    const fileUrl = resourceData?.url;
    if (fileUrl) {
      await deleteStorageFileByUrl(fileUrl);
    }

    stage = "deleteDatabaseDocument";
    await deleteDocumentAdmin("resources", resourceId);

    return NextResponse.json({ 
      success: true, 
      message: "Resource completely deleted."
    });
  } catch (err: unknown) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(err);
    return NextResponse.json({ success: false, stage, message, retryable: true }, { status: 500 });
  }
}
