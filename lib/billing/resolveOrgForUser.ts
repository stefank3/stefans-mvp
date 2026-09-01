import "server-only";

import { consumeBoundSignupIntent, validateBoundSignupIntent } from "@/lib/auth/signupIntent";
import { ensureOrgForUser, type EnsureOrgState } from "@/lib/billing/ensureOrgForUser";
import { prisma } from "@/lib/prisma";

export class AccountNotProvisionedError extends Error {
  constructor() {
    super("account_not_provisioned");
    this.name = "AccountNotProvisionedError";
  }
}

export class AccountProvisioningUnavailableError extends Error {
  constructor() {
    super("account_provisioning_unavailable");
    this.name = "AccountProvisioningUnavailableError";
  }
}

export type ResolveOrgForUserResult = {
  orgState: EnsureOrgState;
  clearSignupIntentCookie: boolean;
};

export async function resolveOrgForUser(params: {
  auth0Sub: string;
  name?: string | null;
  email?: string | null;
  isAuth0Admin?: boolean;
  signupIntentNonce?: string | null;
}): Promise<ResolveOrgForUserResult> {
  const member = await prisma.orgMember.findFirst({
    where: { auth0Sub: params.auth0Sub },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  if (member) {
    return {
      orgState: await ensureOrgForUser(params),
      // Existing membership is authoritative and must not depend on Redis cleanup.
      clearSignupIntentCookie: Boolean(params.signupIntentNonce),
    };
  }

  if (!params.signupIntentNonce) {
    throw new AccountNotProvisionedError();
  }

  const validation = await validateBoundSignupIntent(
    params.signupIntentNonce,
    params.auth0Sub
  );

  if (!validation.ok) {
    if (validation.reason === "unavailable") {
      throw new AccountProvisioningUnavailableError();
    }
    throw new AccountNotProvisionedError();
  }

  const orgState = await ensureOrgForUser(params);

  // Membership is now product truth. Cleanup is best-effort: a failed delete must
  // not roll back a successful provisioning transaction, and the bound record expires.
  await consumeBoundSignupIntent(params.signupIntentNonce, params.auth0Sub);

  return {
    orgState,
    clearSignupIntentCookie: true,
  };
}
