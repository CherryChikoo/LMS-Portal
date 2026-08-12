import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

const cleanSlug = (v?: string | null): string =>
  v ? String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "";

export async function POST(request: NextRequest) {
  try {
    const { collegeName } = await request.json();

    if (!collegeName || typeof collegeName !== "string") {
      return NextResponse.json({ success: false, error: "Invalid college name" }, { status: 400 });
    }

    const slug = cleanSlug(collegeName);
    const lowerName = collegeName.toLowerCase().trim();

    if (!slug) {
      return NextResponse.json({ success: false, error: "Invalid college name" }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Check if a college already exists by name (case-insensitive) to avoid duplicate documents
    // This handles the case where bulk import created "col-college-1" and self-registration tries to create "college1"
    const existingByName = await db.collection("colleges")
      .where("name", "==", lowerName)
      .limit(1)
      .get();

    if (!existingByName.empty) {
      // College already exists (created by bulk import or admin), don't create a duplicate
      const existing = existingByName.docs[0];
      return NextResponse.json({ success: true, slug: existing.id, lowerName, alreadyExists: true });
    }

    // Also check by the slug-based doc ID
    const collegeRef = db.collection("colleges").doc(slug);
    const docSnap = await collegeRef.get();
    
    if (!docSnap.exists) {
      await collegeRef.set({
        id: slug,
        name: lowerName,
        type: "external",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`[API] register-college: Created new external college doc for ${slug}`);
    }

    return NextResponse.json({ success: true, slug, lowerName });
  } catch (error) {
    console.error("[API] register-college error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
