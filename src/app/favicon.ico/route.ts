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
    console.error("Failed to serve dynamic favicon.ico:", err);
  }

  // Transparent 1x1 PNG fallback
  const fallbackPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );
  return new NextResponse(fallbackPng, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}
