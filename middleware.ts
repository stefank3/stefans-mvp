import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  // Always run Auth0 middleware (session rolling + handles /auth routes)
  const res = await auth0.middleware(request);

  // ---- Protect your UI routes (custom gate) ----
  const { pathname } = request.nextUrl;

  // Allow public paths (tweak as you want)
  const isPublic =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (isPublic) return res;

  // If no session, redirect to login
  const session = await auth0.getSession(request);
  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
