import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function applyNoCacheHeaders(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignore static assets, Next.js internal routes, and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get("lms_auth")?.value;
  const roleCookie = request.cookies.get("lms_role")?.value;
  const statusCookie = request.cookies.get("lms_status")?.value;
  const isAuth = authCookie === "true";

  // Public authentication routes
  const isPublicRoute = pathname === "/login" || pathname === "/register";

  if (isPublicRoute) {
    if (isAuth && roleCookie) {
      if (statusCookie === "restricted") {
        return NextResponse.next();
      }
      const target =
        roleCookie === "admin" || roleCookie === "trainer" || roleCookie === "college_admin"
          ? "/"
          : "/student";
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next();
  }

  // If not authenticated and trying to access any protected page
  if (!isAuth) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If authenticated but account is restricted, redirect to login with error
  if (statusCookie === "restricted") {
    return NextResponse.redirect(new URL("/login?error=restricted", request.url));
  }

  const isAdminOrTrainer =
    roleCookie === "admin" || roleCookie === "trainer" || roleCookie === "college_admin";

  // Handle student role route restrictions
  if (!isAdminOrTrainer && roleCookie === "student") {
    const trainerOnlyRoutes = [
      "/students",
      "/colleges",
      "/batches",
      "/question-bank",
      "/reports",
      "/announcements",
      "/audit",
      "/admin",
    ];

    const isBlocked = trainerOnlyRoutes.some(
      (r) => pathname === r || pathname.startsWith(`${r}/`)
    );

    if (isBlocked) {
      return NextResponse.redirect(new URL("/student", request.url));
    }
  }

  // For /admin prefixed aliases
  if (pathname.startsWith("/admin")) {
    if (!isAdminOrTrainer && roleCookie === "student") {
      return NextResponse.redirect(new URL("/student", request.url));
    }
    return applyNoCacheHeaders(NextResponse.next());
  }

  // For /student prefixed aliases
  if (pathname.startsWith("/student")) {
    const stripped = pathname.replace(/^\/student/, "") || "/";
    const trainerOnlyRoutes = ["/colleges", "/students", "/batches", "/question-bank", "/reports"];
    if (!isAdminOrTrainer && trainerOnlyRoutes.some((r) => stripped === r || stripped.startsWith(`${r}/`))) {
      return NextResponse.redirect(new URL("/student", request.url));
    }
    return applyNoCacheHeaders(NextResponse.next());
  }

  return applyNoCacheHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
