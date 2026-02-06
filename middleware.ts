import { NextRequest, NextResponse } from "next/server";

/**
 * MVP password protection using HTTP Basic Auth.
 * - Fastest way to protect demo access on Vercel.
 * - Prevents random visitors from consuming your OpenAI tokens.
 *
 * Set these in .env.local (and in Vercel env vars later):
 *  - BASIC_AUTH_USER
 *  - BASIC_AUTH_PASS
 */
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  // If not configured, do nothing (dev convenience).
  // For production you SHOULD set these.
  if (!user || !pass) return NextResponse.next();

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return unauthorized();

  const [scheme, encoded] = authHeader.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorized();

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const [u, p] = decoded.split(":");

  if (u === user && p === pass) return NextResponse.next();
  return unauthorized();
}

function unauthorized() {
  return new NextResponse("Auth required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Stefan MVP"',
    },
  });
}

/**
 * Protect only the routes we care about:
 * - /chat (UI)
 * - /api/chat (model calls)
 *
 * You can expand later.
 */
export const config = {
  matcher: ["/chat/:path*", "/api/chat/:path*"],
};
