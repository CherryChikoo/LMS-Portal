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
