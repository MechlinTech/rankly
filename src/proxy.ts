import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const PROTECTED_PREFIXES = ["/keywords", "/rankings", "/audit", "/crm", "/team", "/billing", "/admin"];

// Lightweight cookie-presence check only, for a fast redirect before rendering.
// Full session validation (expiry, revocation, tenant status) happens in route
// handlers / server components — never trust this check alone for authorization.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const hasSessionCookie = req.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/keywords/:path*",
    "/rankings/:path*",
    "/audit/:path*",
    "/crm/:path*",
    "/team/:path*",
    "/billing/:path*",
    "/admin/:path*",
  ],
};
