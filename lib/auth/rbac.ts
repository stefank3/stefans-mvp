// lib/auth/rbac.ts
/**
 * RBAC helpers (Auth0 access token roles claim).
 * We read roles ONLY from the Access Token because in Auth0 Next.js SDK v4
 * session.user may not include namespaced custom claims.
 */

import { auth0 } from "@/lib/auth0";

export const RBAC = {
  ROLES_CLAIM: "https://stefans-mvp/claims/roles",
  ADMIN_ROLE: "admin",
} as const;

/**
 * Decode JWT payload without verifying signature.
 * Safe here because token is retrieved server-side from Auth0 session.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Read roles from Access Token custom claim. */
export async function getRolesFromAccessToken(): Promise<string[]> {
  const tokenResult = await auth0.getAccessToken();
  const token = tokenResult?.token;

  if (!token) return [];

  const claims = decodeJwtPayload(token);
  const rolesValue = claims?.[RBAC.ROLES_CLAIM];

  return Array.isArray(rolesValue) ? (rolesValue as string[]) : [];
}

/** Convenience helper: admin check. */
export async function isAdminFromAccessToken(): Promise<boolean> {
  const roles = await getRolesFromAccessToken();
  return roles.includes(RBAC.ADMIN_ROLE);
}
