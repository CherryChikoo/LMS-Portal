import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const role = cookieStore.get("lms_role")?.value?.toLowerCase();
    const isCollegeTenant = role === "student" || role === "college_student" || role === "college_admin";

    // If a college tenant is requesting the default favicon, serve the transparent one immediately
    // so they never see the main admin's logo while the page is loading.
    if (!isCollegeTenant) {
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
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          },
        });
      }
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
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
