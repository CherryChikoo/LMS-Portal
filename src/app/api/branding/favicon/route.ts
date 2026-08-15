import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const branding = await prisma.settings.findUnique({
      where: { id: "branding" },
      select: { logoBase64: true },
    });

    if (branding?.logoBase64 && branding.logoBase64.includes("base64,")) {
      const parts = branding.logoBase64.split("base64,");
      const mimeMatch = parts[0].match(/data:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const buffer = Buffer.from(parts[1], "base64");

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }
  } catch (err) {
    console.error("Failed to load branding favicon:", err);
  }

  // Fallback 1x1 transparent PNG if no logo configured
  const fallbackPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  return new NextResponse(fallbackPng, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}
