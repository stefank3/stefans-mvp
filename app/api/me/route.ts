// app/api/me/route.ts
/**
 * Minimal "who am I" endpoint for the UI.
 * - Avoids returning full session/user object (PII + unstable shape)
 * - Provides the minimum needed for UI gating (email + isAdmin)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { isAdminFromAccessToken } from "@/lib/auth/rbac";

type MeResponse =
  | { authenticated: true; email: string; isAdmin: boolean }
  | { authenticated: false };

export async function GET() {
  const session = await auth0.getSession();

  if (!session?.user) {
    return NextResponse.json<MeResponse>({ authenticated: false }, { status: 200 });
  }

  const user = session.user as Record<string, unknown>;
  const email = (user.email as string | undefined) ?? "Unknown user";

  // Auth0 Next.js SDK v4: namespaced claims may not be present in session.user
  // so we use the Access Token for role checks.
  const isAdmin = await isAdminFromAccessToken();

  return NextResponse.json<MeResponse>(
    {
      authenticated: true,
      email,
      isAdmin,
    },
    { status: 200 }
  );
}
