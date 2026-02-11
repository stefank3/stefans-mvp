import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const ROLES_CLAIM = "https://stefans-mvp/claims/roles";
const ADMIN_ROLE = "admin";

/**
 * Production identity endpoint.
 * Returns minimal information needed by the UI.
 */
export async function GET() {
  const session = await auth0.getSession();

  if (!session?.user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  const user = session.user as Record<string, unknown>;
  const email = (user.email as string | undefined) ?? "Unknown user";

  // In v4, roles may not be in session.user,
  // so we read from Access Token.
  const tokenResult = await auth0.getAccessToken();
  const token = tokenResult?.token;

  let roles: string[] = [];

  if (token && token.split(".").length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8")
      );
      const rolesValue = payload?.[ROLES_CLAIM];
      if (Array.isArray(rolesValue)) roles = rolesValue;
    } catch {
      roles = [];
    }
  }

  const isAdmin = roles.includes(ADMIN_ROLE);

  return NextResponse.json(
    {
      authenticated: true,
      email,
      roles,
      isAdmin,
    },
    { status: 200 }
  );
}
