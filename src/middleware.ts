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
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/admin/login" ||
    pathname === "/college/login";

  if (isPublicRoute) {
    if (isAuth) {
      if (statusCookie === "restricted") {
        return NextResponse.next();
      }
      const target = (roleCookie === "admin" || roleCookie === "trainer" || roleCookie === "college_admin") ? "/admin" : "/student";
      return NextResponse.redirect(new URL(target, request.url));
    }
    return NextResponse.next();
  }

  // If not authenticated and trying to access any protected page
  if (!isAuth) {
    const loginPath = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  // If authenticated but account is restricted, redirect to login with error
  if (statusCookie === "restricted") {
    const loginPath = pathname.startsWith("/admin") ? "/admin/login?error=restricted" : "/login?error=restricted";
    return NextResponse.redirect(new URL(loginPath, request.url));
  }

  // Handle /admin routes
  if (pathname.startsWith("/admin")) {
    if (roleCookie === "student") {
      return NextResponse.redirect(new URL("/student", request.url));
    }
    return applyNoCacheHeaders(NextResponse.next());
  }

  // Handle /student routes
  if (pathname.startsWith("/student")) {
    if (roleCookie !== "student") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    const stripped = pathname.replace(/^\/student/, "") || "/";
    const trainerOnlyRoutes = ["/colleges", "/students", "/batches"];
    if (trainerOnlyRoutes.some((r) => stripped === r || stripped.startsWith(`${r}/`))) {
      return NextResponse.redirect(new URL("/student", request.url));
    }
    return applyNoCacheHeaders(NextResponse.next());
  }

  // If logged-in user accesses unprefixed root or path directly, redirect to their role prefix
  const prefix = (roleCookie === "admin" || roleCookie === "trainer" || roleCookie === "college_admin") ? "/admin" : "/student";
  const targetPath = pathname === "/" ? prefix : `${prefix}${pathname}`;
  return NextResponse.redirect(new URL(targetPath, request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
