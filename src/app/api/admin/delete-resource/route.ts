import 'server-only';
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
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
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(adminIdToken);
    } catch (err: unknown) {
      return NextResponse.json({ success: false, stage, errorCode: "invalid-token", message: "Invalid or expired admin session." }, { status: 401 });
    }

    const requesterUid = decodedToken.uid;
    const db = getFirestore(getAdminApp());

    stage = "verifyAdminRole";
    const requesterDoc = await db.collection("users").doc(requesterUid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data()?.role : undefined;
    
    if (requesterRole !== "main_admin" && requesterRole !== "admin" && requesterRole !== "college_admin" && requesterRole !== "trainer") {
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
    const resourceDoc = await db.collection("resources").doc(resourceId).get();
    if (!resourceDoc.exists) {
      return NextResponse.json({ success: false, stage, errorCode: "not-found", message: "Resource not found." }, { status: 404 });
    }

    const resourceData = resourceDoc.data();

    // BOLA Check: If college_admin, ensure they only delete their own college's resources
    if (requesterRole === "college_admin") {
      const requesterCollegeId = requesterDoc.data()?.collegeId;
      if (resourceData?.collegeId !== requesterCollegeId) {
        return NextResponse.json({ success: false, stage, errorCode: "permission-denied", message: "You can only delete resources belonging to your college." }, { status: 403 });
      }
    }

    stage = "deleteStorageFile";
    const fileUrl = resourceData?.url || resourceData?.fileUrl || resourceData?.downloadUrl;
    if (fileUrl) {
      await deleteStorageFileByUrl(fileUrl);
    }

    stage = "deleteFirestoreDocument";
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
