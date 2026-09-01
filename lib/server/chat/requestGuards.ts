// lib/server/chat/requestGuards.ts
// M10 extraction:
// Centralize request/auth/preflight guard logic so route.ts
// focuses on orchestration instead of validation plumbing.
//
// M12.9 CHANGE:
// - allow artifact-driven workflow action requests without freeform message
// - preserve existing validation for normal prompt-driven requests
// - derive mode/execution from action when action is present
// - keep guards deterministic and request-focused
//
// M12.9 Phase 2 CHANGE:
// - recognize generate_next_batch_of_tests as a valid workflow action
// - recognize refine_requirement as a valid workflow action
// - treat next-batch as cases/coaching execution without requiring message
// - treat refine_requirement as coach/non-cases execution without requiring message

import { auth0 } from "@/lib/auth0";
import { SIGNUP_INTENT_COOKIE_NAME } from "@/lib/auth/signupIntent";
import { log } from "@/lib/logger";
import { cookies } from "next/headers";

import { isAdminFromAccessToken } from "@/lib/auth/rbac";
import { evaluateAccountAccess } from "@/lib/billing/accountAccess";
import type { EnsureOrgState } from "@/lib/billing/ensureOrgForUser";
import {
  AccountNotProvisionedError,
  AccountProvisioningUnavailableError,
  resolveOrgForUser,
} from "@/lib/billing/resolveOrgForUser";
import { chatRatelimit, CHAT_RATE_LIMIT } from "@/lib/ratelimit";

import {
  normalizeClientMode,
  type ChatBody,
  type ClientMode,
  type ExecutionMode,
  type RateMeta,
} from "@/lib/chat/chatTypes";
import { isWeakInput } from "@/lib/chat/inputQuality";
import {
  buildAccountAccessRequiredResponse,
  buildAccountProvisioningErrorResponse,
  buildForbiddenResponse,
  buildInputTooLargeResponse,
  buildInvalidJsonBodyResponse,
  buildMissingMessageResponse,
  buildRateLimitExceededResponse,
  buildUnauthorizedResponse,
} from "@/lib/server/chat/responseBuilder";
import type {
  ChatMetricMode,
  ChatMetricStatus,
} from "@/lib/metrics/chatMetrics";

type MetricRecorder = (args: {
  nowMs: number;
  mode: ChatMetricMode;
  status: ChatMetricStatus;
  latencyMs: number;
  rateLimited?: boolean;
}) => Promise<void>;

type WorkflowAction =
  | "generate_tests_from_requirement"
  | "generate_next_batch_of_tests"
  | "review_test_suite"
  | "refine_requirement"
  | "regenerate_suite";
  
type AuthResult =
  | {
      ok: false;
      response: Response;
    }
  | {
      ok: true;
      user: NonNullable<Awaited<ReturnType<typeof auth0.getSession>>>["user"];
      auth0Sub: string;
    };

type ParseResult =
  | {
      ok: false;
      response: Response;
    }
  | {
      ok: true;
      body: ChatBody;
      message: string;
      clientMode: ClientMode;
      wantCases: boolean;
      wantReview: boolean;
      executionMode: ExecutionMode;
      weakInput: boolean;
      explicitRegenerationRequest: boolean;
    };

type ReviewAccessResult =
  | {
      ok: false;
      response: Response;
    }
  | {
      ok: true;
    };

type BillingPrecheckResult =
  | {
      ok: false;
      response: Response;
    }
  | {
      ok: true;
      orgId: string | undefined;
      orgState: EnsureOrgState;
    };

type RateLimitResult =
  | {
      ok: false;
      response: Response;
      rateMeta: RateMeta;
    }
  | {
      ok: true;
      rateMeta: RateMeta;
    };

function getWorkflowAction(body: ChatBody): WorkflowAction | null {
  const candidate = (body as { action?: unknown })?.action;

  if (
    candidate === "generate_tests_from_requirement" ||
    candidate === "generate_next_batch_of_tests" ||
    candidate === "review_test_suite" ||
    candidate === "refine_requirement" ||
    candidate === "regenerate_suite"
  ) {
    return candidate;
  }

  return null;
}

export async function requireAuthenticatedUser(args: {
  requestId: string;
  startTime: number;
  modeForMetric: ChatMetricMode;
  recordChatMetric: MetricRecorder;
}): Promise<AuthResult> {
  const session = await auth0.getSession();

  if (!session?.user) {
    log("warn", {
      event: "unauthorized",
      requestId: args.requestId,
      errorType: "unauthorized",
      errorMessage: "Missing Auth0 session",
      durationMs: Date.now() - args.startTime,
      meta: { path: "/api/chat" },
    });

    await args.recordChatMetric({
      nowMs: Date.now(),
      mode: args.modeForMetric,
      status: 401,
      latencyMs: Date.now() - args.startTime,
    });

    return {
      ok: false,
      response: buildUnauthorizedResponse(args.requestId),
    };
  }

  const user = session.user;
  const sub = user.sub as string | undefined;

  if (!sub) {
    log("warn", {
      event: "unauthorized",
      requestId: args.requestId,
      errorType: "unauthorized",
      errorMessage: "Missing Auth0 sub",
      durationMs: Date.now() - args.startTime,
      meta: { reason: "missing_sub" },
    });

    await args.recordChatMetric({
      nowMs: Date.now(),
      mode: args.modeForMetric,
      status: 401,
      latencyMs: Date.now() - args.startTime,
    });

    return {
      ok: false,
      response: buildUnauthorizedResponse(args.requestId),
    };
  }

  return {
    ok: true,
    user,
    auth0Sub: sub,
  };
}

export async function parseAndValidateChatRequest(args: {
  req: Request;
  requestId: string;
  startTime: number;
  modeForMetric: ChatMetricMode;
  recordChatMetric: MetricRecorder;
  isExplicitRegenerationRequest: (message: string) => boolean;
}): Promise<ParseResult> {
  let body: ChatBody = {};

  try {
    body = (await args.req.json()) as ChatBody;
  } catch {
    await args.recordChatMetric({
      nowMs: Date.now(),
      mode: args.modeForMetric,
      status: 400,
      latencyMs: Date.now() - args.startTime,
    });

    return {
      ok: false,
      response: buildInvalidJsonBodyResponse(args.requestId),
    };
  }

  const workflowAction = getWorkflowAction(body);

  if (workflowAction) {
    const clientMode: ClientMode =
      workflowAction === "review_test_suite"
        ? "review"
        : normalizeClientMode(body?.mode);

const wantCases =
  workflowAction === "generate_tests_from_requirement" ||
  workflowAction === "generate_next_batch_of_tests" ||
  workflowAction === "regenerate_suite";

const wantReview = workflowAction === "review_test_suite";
const executionMode: ExecutionMode = wantReview ? "review" : "coach";

    return {
      ok: true,
      body,
      message: "",
      clientMode,
      wantCases,
      wantReview,
      executionMode,
      weakInput: false,
      explicitRegenerationRequest: false,
    };
  }

  const message = body?.message;
  if (!message || typeof message !== "string") {
    await args.recordChatMetric({
      nowMs: Date.now(),
      mode: args.modeForMetric,
      status: 400,
      latencyMs: Date.now() - args.startTime,
    });

    return {
      ok: false,
      response: buildMissingMessageResponse(args.requestId),
    };
  }

  const clientMode: ClientMode = normalizeClientMode(body?.mode);
  const wantCases = clientMode === "cases";
  const wantReview = clientMode === "review";
  const executionMode: ExecutionMode = wantReview ? "review" : "coach";
  const weakInput = isWeakInput(message);
  const explicitRegenerationRequest = args.isExplicitRegenerationRequest(message);

  if (message.length > 8000) {
    await args.recordChatMetric({
      nowMs: Date.now(),
      mode: clientMode,
      status: 400,
      latencyMs: Date.now() - args.startTime,
    });

    return {
      ok: false,
      response: buildInputTooLargeResponse({
        requestId: args.requestId,
        clientMode,
        messageLength: message.length,
      }),
    };
  }

  return {
    ok: true,
    body,
    message,
    clientMode,
    wantCases,
    wantReview,
    executionMode,
    weakInput,
    explicitRegenerationRequest,
  };
}

export async function requireReviewAccess(args: {
  executionMode: ExecutionMode;
  requestId: string;
  auth0Sub: string;
  clientMode: ClientMode;
  startTime: number;
  recordChatMetric: MetricRecorder;
}): Promise<ReviewAccessResult> {
  if (args.executionMode !== "review") {
    return { ok: true };
  }

  const isAdmin = await isAdminFromAccessToken();
  if (isAdmin) return { ok: true };

  log("warn", {
    event: "forbidden_review_access",
    requestId: args.requestId,
    auth0Sub: args.auth0Sub,
    mode: args.clientMode,
    durationMs: Date.now() - args.startTime,
  });

  await args.recordChatMetric({
    nowMs: Date.now(),
    mode: args.clientMode,
    status: 403,
    latencyMs: Date.now() - args.startTime,
  });

  return {
    ok: false,
    response: buildForbiddenResponse({
      requestId: args.requestId,
      clientMode: args.clientMode,
    }),
  };
}

export async function ensureBillingPreconditions(args: {
  auth0Sub: string;
  user: { name?: unknown; email?: unknown };
  requestId: string;
  clientMode: ClientMode;
  startTime: number;
  recordChatMetric: MetricRecorder;
}): Promise<BillingPrecheckResult> {
  const isAdmin = await isAdminFromAccessToken();
  const cookieStore = await cookies();
  const signupIntentNonce = cookieStore.get(SIGNUP_INTENT_COOKIE_NAME)?.value;
  let resolvedAccount;

  try {
    resolvedAccount = await resolveOrgForUser({
      auth0Sub: args.auth0Sub,
      name: (args.user.name as string | undefined) ?? null,
      email: (args.user.email as string | undefined) ?? null,
      isAuth0Admin: isAdmin,
      signupIntentNonce,
    });
  } catch (error) {
    const reason =
      error instanceof AccountNotProvisionedError
        ? "account_not_provisioned"
        : error instanceof AccountProvisioningUnavailableError
          ? "account_provisioning_unavailable"
          : null;

    if (!reason) throw error;

    if (reason === "account_not_provisioned") {
      cookieStore.delete(SIGNUP_INTENT_COOKIE_NAME);
      await args.recordChatMetric({
        nowMs: Date.now(),
        mode: args.clientMode,
        status: 403,
        latencyMs: Date.now() - args.startTime,
      });
    }

    return {
      ok: false,
      response: buildAccountProvisioningErrorResponse({
        requestId: args.requestId,
        clientMode: args.clientMode,
        reason,
      }),
    };
  }

  if (resolvedAccount.clearSignupIntentCookie) {
    cookieStore.delete(SIGNUP_INTENT_COOKIE_NAME);
  }

  const orgState = resolvedAccount.orgState;

  const orgId =
    typeof orgState.organizationId === "string"
      ? orgState.organizationId
      : undefined;

  if (isAdmin) {
    if (orgState.wallet.balance <= 0) {
      await args.recordChatMetric({
        nowMs: Date.now(),
        mode: args.clientMode,
        status: 402,
        latencyMs: Date.now() - args.startTime,
      });

      log("warn", {
        event: "billing_failure",
        requestId: args.requestId,
        auth0Sub: args.auth0Sub,
        orgId,
        mode: args.clientMode,
        errorType: "insufficient_credits",
        errorMessage: "Admin wallet has insufficient credits for billable AI usage",
        durationMs: Date.now() - args.startTime,
        meta: {
          reason: "insufficient_credits",
          creditsRemaining: orgState.wallet.balance,
          adminAccessBypass: true,
        },
      });

      return {
        ok: false,
        response: buildAccountAccessRequiredResponse({
          requestId: args.requestId,
          clientMode: args.clientMode,
          reason: "insufficient_credits",
          creditsRemaining: Math.max(0, orgState.wallet.balance),
          planStatus: null,
          currentPeriodEnd: null,
        }),
      };
    }

    return {
      ok: true,
      orgId,
      orgState,
    };
  }

  const accountAccess = await evaluateAccountAccess({
    organizationId: orgId,
    wallet: orgState.wallet,
  });

  if (accountAccess.ok) {
    return {
      ok: true,
      orgId,
      orgState,
    };
  }

  await args.recordChatMetric({
    nowMs: Date.now(),
    mode: args.clientMode,
    status: 402,
    latencyMs: Date.now() - args.startTime,
  });

  log("warn", {
    event: "billing_failure",
    requestId: args.requestId,
    auth0Sub: args.auth0Sub,
    orgId,
    mode: args.clientMode,
    errorType: "account_access_required",
    errorMessage: "Account access check failed before OpenAI call",
    durationMs: Date.now() - args.startTime,
    meta: {
      reason: accountAccess.reason,
      creditsRemaining: accountAccess.creditsRemaining,
      planStatus: accountAccess.planStatus,
      currentPeriodEnd: accountAccess.currentPeriodEnd,
    },
  });

  return {
    ok: false,
    response: buildAccountAccessRequiredResponse({
      requestId: args.requestId,
      clientMode: args.clientMode,
      reason: accountAccess.reason,
      creditsRemaining: accountAccess.creditsRemaining,
      planStatus: accountAccess.planStatus,
      currentPeriodEnd: accountAccess.currentPeriodEnd,
    }),
  };
}

export async function enforceRateLimit(args: {
  identifier: string;
  requestId: string;
  auth0Sub: string;
  orgId: string | undefined;
  clientMode: ClientMode;
  startTime: number;
  recordChatMetric: MetricRecorder;
}): Promise<RateLimitResult> {
  const { success, remaining, reset } = await chatRatelimit.limit(args.identifier);

  const resetSeconds =
    typeof reset === "number"
      ? Math.max(1, Math.ceil((reset - Date.now()) / 1000))
      : 60;

  const rateMeta: RateMeta = {
    limit: CHAT_RATE_LIMIT.limit,
    remaining: typeof remaining === "number" ? remaining : 0,
    resetSeconds,
  };

  if (success) {
    return {
      ok: true,
      rateMeta,
    };
  }

  log("warn", {
    event: "rate_limit_exceeded",
    requestId: args.requestId,
    auth0Sub: args.auth0Sub,
    orgId: args.orgId,
    mode: args.clientMode,
    errorType: "rate_limited",
    errorMessage: "Chat rate limit exceeded",
    durationMs: Date.now() - args.startTime,
    meta: {
      limit: CHAT_RATE_LIMIT.limit,
      remaining,
      resetSeconds,
    },
  });

  await args.recordChatMetric({
    nowMs: Date.now(),
    mode: args.clientMode,
    status: 429,
    latencyMs: Date.now() - args.startTime,
    rateLimited: true,
  });

  return {
    ok: false,
    response: buildRateLimitExceededResponse({
      requestId: args.requestId,
      rateMeta,
      resetSeconds,
    }),
    rateMeta,
  };
}
