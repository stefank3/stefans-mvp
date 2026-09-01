// app/api/me/route.ts
/**
 * Minimal "who am I" endpoint for the UI.
 * - Avoids returning full session/user object (PII + unstable shape)
 * - Provides safe account status from server/database-owned truth
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth0 } from "@/lib/auth0";
import { SIGNUP_INTENT_COOKIE_NAME } from "@/lib/auth/signupIntent";
import { isAdminFromAccessToken } from "@/lib/auth/rbac";
import {
  AccountNotProvisionedError,
  AccountProvisioningUnavailableError,
  resolveOrgForUser,
} from "@/lib/billing/resolveOrgForUser";
import { prisma } from "@/lib/prisma";
import { enforceRouteRateLimit } from "@/lib/server/rateLimit";
import { buildInternalServerErrorResponse, getRequestId } from "@/lib/server/apiErrorResponse";
import { log } from "@/lib/logger";

type MeResponse =
  | {
      authenticated: true;
      auth0Sub: string;
      email: string;
      isAdmin: boolean;
      organizationId: string;
      planCode: string | null;
      planStatus: string | null;
      trialEndsAt: string | null;
      creditsRemaining: number;
      trialDaysRemaining: number | null;
      seats: number | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
    }
  | { authenticated: false }
  | {
      authenticated: true;
      error: "account_not_provisioned" | "account_provisioning_unavailable";
    };

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function getTrialDaysRemaining(planStatus: string | null | undefined, currentPeriodEnd: Date | null | undefined) {
  if (planStatus !== "trialing" || !currentPeriodEnd) return null;

  const remainingMs = currentPeriodEnd.getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return NextResponse.json<MeResponse>({ authenticated: false }, { status: 200 });
    }

    const user = session.user as Record<string, unknown>;
    const auth0Sub = user.sub as string | undefined;

    if (!auth0Sub) {
      return NextResponse.json<MeResponse>({ authenticated: false }, { status: 401 });
    }

    const rateLimit = await enforceRouteRateLimit({
      policy: "accountStatus",
      identifier: `user:${auth0Sub}`,
      requestId,
    });

    if (!rateLimit.ok) {
      return rateLimit.response;
    }

    const email = (user.email as string | undefined) ?? "Unknown user";
    const name = (user.name as string | undefined) ?? null;

    // Auth0 Next.js SDK v4: namespaced claims may not be present in session.user
    // so we use the Access Token for role checks.
    const isAdmin = await isAdminFromAccessToken();
    const cookieStore = await cookies();
    const signupIntentNonce = cookieStore.get(SIGNUP_INTENT_COOKIE_NAME)?.value;
    let resolvedAccount;

    try {
      resolvedAccount = await resolveOrgForUser({
        auth0Sub,
        name,
        email,
        isAuth0Admin: isAdmin,
        signupIntentNonce,
      });
    } catch (error) {
      if (error instanceof AccountNotProvisionedError) {
        cookieStore.delete(SIGNUP_INTENT_COOKIE_NAME);
        return NextResponse.json<MeResponse>(
          { authenticated: true, error: "account_not_provisioned" },
          { status: 403 }
        );
      }

      if (error instanceof AccountProvisioningUnavailableError) {
        return NextResponse.json<MeResponse>(
          { authenticated: true, error: "account_provisioning_unavailable" },
          { status: 503 }
        );
      }

      throw error;
    }

    if (resolvedAccount.clearSignupIntentCookie) {
      cookieStore.delete(SIGNUP_INTENT_COOKIE_NAME);
    }

    const orgState = resolvedAccount.orgState;
    const subscription = await prisma.subscription.findFirst({
      where: { organizationId: orgState.organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        planCode: true,
        seats: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    return NextResponse.json<MeResponse>(
      {
        authenticated: true,
        auth0Sub,
        email,
        isAdmin,
        organizationId: orgState.organizationId,
        planCode: subscription?.planCode ?? null,
        planStatus: subscription?.status ?? null,
        trialEndsAt: subscription?.status === "trialing" ? toIsoString(subscription.currentPeriodEnd) : null,
        creditsRemaining: orgState.wallet.balance,
        trialDaysRemaining: getTrialDaysRemaining(subscription?.status, subscription?.currentPeriodEnd),
        seats: subscription?.seats ?? null,
        currentPeriodStart: toIsoString(subscription?.currentPeriodStart),
        currentPeriodEnd: toIsoString(subscription?.currentPeriodEnd),
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    log("error", {
      event: "chat_error",
      requestId,
      errorType: "account_status_failed",
      errorMessage: e instanceof Error ? e.message : "Unknown error",
      meta: { route: "/api/me" },
    });

    return buildInternalServerErrorResponse({ requestId });
  }
}
