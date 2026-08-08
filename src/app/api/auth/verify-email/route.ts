import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebase/admin";
import { getFirestore } from "firebase-admin/firestore";
import { lookupEmailDocuments } from "@/lib/server/email-uniqueness";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json().catch(() => ({}));

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { exists: false, error: "Valid email is required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const db = getFirestore(getAdminApp());

    const lookupStart = Date.now();
    const emailDocs = await lookupEmailDocuments(db, normalizedEmail, { limitPerCollection: 1 });
    console.info(`[perf][verify-email] lookup took ${Date.now() - lookupStart}ms`);

    const userDoc = emailDocs.userDocs.length > 0 ? { id: emailDocs.userDocs[0].id, ...emailDocs.userDocs[0].data() } : null;
    const studentDoc = emailDocs.studentDocs.length > 0 ? { id: emailDocs.studentDocs[0].id, ...emailDocs.studentDocs[0].data() } : null;
    const collegeDoc = emailDocs.collegeDocs.length > 0 ? { id: emailDocs.collegeDocs[0].id, ...emailDocs.collegeDocs[0].data() } : null;

    const exists = Boolean(userDoc || studentDoc || collegeDoc);

    return NextResponse.json({
      exists,
      userDoc,
      studentDoc,
      collegeDoc,
    });
  } catch (err: unknown) {
    console.error("[AUTH] verify-email error:", err);
    return NextResponse.json(
      { exists: false, error: err instanceof Error ? getErrorMessage(err) : String(err) },
      { status: 500 }
    );
  }
}
