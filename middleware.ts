import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/app/") && pathname !== "/app/login") {
    if (!request.cookies.get("rbn_staff_token")) {
      return NextResponse.redirect(new URL("/app/login", request.url));
    }
  }

  if (pathname.startsWith("/admin/") && pathname !== "/admin/login") {
    if (!request.cookies.get("rbn_admin_token")) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"]
};
