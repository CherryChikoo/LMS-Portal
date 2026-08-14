import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";

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

    const [usersSnap, studentsSnap, collegesSnap] = await Promise.all([
      prisma.users.findFirst({ where: { email: normalizedEmail }, select: { id: true, role: true, status: true } }),
      prisma.students.findFirst({ where: { users: { email: normalizedEmail } }, select: { id: true } }),
      prisma.colleges.findFirst({ where: { adminEmail: normalizedEmail }, select: { id: true, status: true, isDeleted: true } }),
    ]);

    let responseUserDoc = usersSnap;
    let responseStudentDoc = studentsSnap;
    let responseCollegeDoc = collegesSnap;

    const exists = Boolean(responseUserDoc || responseStudentDoc || responseCollegeDoc);

    return NextResponse.json({
      exists,
      userDoc: responseUserDoc,
      studentDoc: responseStudentDoc,
      collegeDoc: responseCollegeDoc,
    });
  } catch (err: unknown) {
    console.error("[AUTH] verify-email error:", err);
    return NextResponse.json(
      { exists: false, error: err instanceof Error ? getErrorMessage(err) : String(err) },
      { status: 500 }
    );
  }
}
