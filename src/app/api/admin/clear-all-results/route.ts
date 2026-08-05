import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    getAdminApp();

    const decodedToken = await getAuth().verifyIdToken(token);
    const { role } = decodedToken;

    if (role !== "main_admin" && role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: Only main admins can clear all results" }, { status: 403 });
    }

    const db = getFirestore();
    const resultsRef = db.collection("exam_results");
    const bulkWriter = db.bulkWriter();
    
    // Process in batches
    let deletedCount = 0;
    const query = resultsRef.select(); // Only fetch document IDs
    
    // We can use a recursive batch delete or stream
    const snapshot = await query.get();
    
    snapshot.docs.forEach((doc) => {
      bulkWriter.delete(doc.ref);
      deletedCount++;
    });

    await bulkWriter.close();

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${deletedCount} results.`,
      deletedCount
    });
  } catch (error: any) {
    console.error("[clear-all-results] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
