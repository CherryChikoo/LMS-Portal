import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

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

    // Check if a college already exists by name (case-insensitive)
    const existingByName = await prisma.colleges.findFirst({
      where: {
        name: {
          equals: lowerName,
          mode: 'insensitive'
        }
      }
    });

    if (existingByName) {
      return NextResponse.json({ success: true, slug: existingByName.id, lowerName, alreadyExists: true });
    }

    // Check by slug-based ID
    const docSnap = await prisma.colleges.findUnique({ where: { id: slug } });
    
    if (docSnap) {
      return NextResponse.json({ success: true, slug, lowerName, alreadyExists: true });
    }

    // Create if it doesn't exist
    await prisma.colleges.create({
      data: {
        id: slug,
        name: collegeName,
        code: slug.substring(0, 6).toUpperCase(),
        departments: ["General"],
        studentCount: 0,
        status: "active",
        type: "external",
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          companyName: collegeName,
          companySubtitle: "College Portal",
          logoBase64: "",
        },
      }
    });

    return NextResponse.json({ success: true, slug, lowerName, created: true });
  } catch (error) {
    console.error("Error creating college document:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
