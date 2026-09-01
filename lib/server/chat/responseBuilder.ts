// lib/server/chat/responseBuilder.ts
// M10 extraction:
// Centralize API response shaping so route.ts focuses on orchestration only.
//
// M12.13 CHANGE:
// - add optional execution intelligence payload support to success responses
// - keep response shaping generic and backward compatible
// - do not introduce execution logic in the response layer
//
// M12.14 CHANGE:
// - continue surfacing normalized execution intelligence payloads
// - allow deterministic failure classification data to flow to the client
// - keep responseBuilder transport-only with no classification logic
//
// M12.15 CHANGE:
// - add optional release health payload support to success responses
// - keep response shaping transport-only and backward compatible
// - do not introduce release health computation in the response layer

import { NextResponse } from "next/server";
import { responseHeaders } from "@/lib/chat/http";
import { buildInternalServerErrorResponse } from "@/lib/server/apiErrorResponse";
import type { RateMeta, ClientMode } from "@/lib/chat/chatTypes";
import type {
  ExecutionIntelligenceArtifact,
  ReleaseHealthArtifact,
  SessionArtifact,
} from "@/lib/chat/artifact";
import type { CoachResult, ReviewResult } from "@/lib/framework/reviewSchema";
import type { WorkflowGuidance } from "@/lib/server/chat/workflowAssistantService";
import type { AccountAccessFailureReason } from "@/lib/billing/accountAccess";

type UsagePayload = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type SharedArtifactPayload = {
  artifact: SessionArtifact | null;
  artifactUpdatedAt: string | null;
};

type SharedExecutionPayload = {
  executionIntelligence?: ExecutionIntelligenceArtifact | null;
};

type SharedReleaseHealthPayload = {
  releaseHealth?: ReleaseHealthArtifact | null;
};

export function buildUnauthorizedResponse(requestId: string) {
  return NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401, headers: responseHeaders(requestId) }
  );
}

export function buildInvalidJsonBodyResponse(requestId: string) {
  return NextResponse.json(
    { ok: false, error: "Invalid JSON body" },
    { status: 400, headers: responseHeaders(requestId) }
  );
}

export function buildMissingMessageResponse(requestId: string) {
  return NextResponse.json(
    { ok: false, error: "Missing 'message' (must be a string)" },
    { status: 400, headers: responseHeaders(requestId) }
  );
}

export function buildInputTooLargeResponse(args: {
  requestId: string;
  clientMode: ClientMode;
  messageLength: number;
}) {
  const inputTooLargeMessage =
    args.clientMode === "review"
      ? "Input too large for a single review request. Please split the suite into smaller sections and review them in parts."
      : args.clientMode === "cases"
        ? "Input too large for a single test design request. Please reduce the pasted scope or generate the suite incrementally."
        : "Input too large for a single Strategy request. Please shorten the requirement or split it into smaller parts.";

  return NextResponse.json(
    {
      ok: false,
      error: inputTooLargeMessage,
      details: `Received ${args.messageLength} characters. Maximum supported length is 8000.`,
    },
    { status: 400, headers: responseHeaders(args.requestId) }
  );
}

export function buildForbiddenResponse(args: {
  requestId: string;
  clientMode: ClientMode;
}) {
  return NextResponse.json(
    { ok: false, mode: args.clientMode, error: "Forbidden" },
    { status: 403, headers: responseHeaders(args.requestId) }
  );
}

export function buildAccountProvisioningErrorResponse(args: {
  requestId: string;
  clientMode: ClientMode;
  reason: "account_not_provisioned" | "account_provisioning_unavailable";
}) {
  const unavailable = args.reason === "account_provisioning_unavailable";

  return NextResponse.json(
    {
      ok: false,
      mode: args.clientMode,
      error: unavailable ? "Account provisioning unavailable" : "Account not provisioned",
      reason: args.reason,
    },
    {
      status: unavailable ? 503 : 403,
      headers: responseHeaders(args.requestId),
    }
  );
}

export function buildAccountAccessRequiredResponse(args: {
  requestId: string;
  clientMode: ClientMode;
  reason: AccountAccessFailureReason;
  creditsRemaining: number;
  planStatus: string | null;
  currentPeriodEnd: string | null;
}) {
  return NextResponse.json(
    {
      ok: false,
      mode: args.clientMode,
      error: "Account access required",
      reason: args.reason,
      creditsRemaining: args.creditsRemaining,
      planStatus: args.planStatus,
      currentPeriodEnd: args.currentPeriodEnd,
    },
    { status: 402, headers: responseHeaders(args.requestId) }
  );
}

export function buildRateLimitExceededResponse(args: {
  requestId: string;
  rateMeta: RateMeta;
  resetSeconds: number;
}) {
  return NextResponse.json(
    {
      ok: false,
      error: "Rate limit exceeded",
      details: `Too many requests. Try again in ~${args.resetSeconds}s.`,
      rate: { ...args.rateMeta, remaining: 0 },
    },
    {
      status: 429,
      headers: responseHeaders(
        args.requestId,
        { ...args.rateMeta, remaining: 0 },
        args.resetSeconds
      ),
    }
  );
}

export function buildInsufficientCreditsBillingResponse(args: {
  requestId: string;
  clientMode: ClientMode;
  sessionId: string;
  creditsCharged: number;
  creditsRemaining: number;
  usage: UsagePayload;
  rateMeta: RateMeta | null;
} & SharedArtifactPayload) {
  return NextResponse.json(
    {
      ok: false,
      mode: args.clientMode,
      error: "Insufficient credits",
      sessionId: args.sessionId,
      creditsCharged: args.creditsCharged,
      creditsRemaining: args.creditsRemaining,
      usage: args.usage,
      rate: args.rateMeta,
      artifact: args.artifact,
      artifactUpdatedAt: args.artifactUpdatedAt,
    },
    { status: 402, headers: responseHeaders(args.requestId, args.rateMeta ?? undefined) }
  );
}

export function buildReviewParseFailureResponse(args: {
  requestId: string;
  clientMode: ClientMode;
  rawReply: string;
  sessionId: string;
  creditsCharged: number;
  creditsRemaining: number | null;
  usage: UsagePayload;
  rateMeta: RateMeta | null;
} & SharedArtifactPayload) {
  return NextResponse.json(
    {
      ok: false,
      mode: args.clientMode,
      error: "Failed to parse review JSON",
      raw: args.rawReply,
      sessionId: args.sessionId,
      creditsCharged: args.creditsCharged,
      creditsRemaining: args.creditsRemaining,
      usage: args.usage,
      rate: args.rateMeta,
      artifact: args.artifact,
      artifactUpdatedAt: args.artifactUpdatedAt,
    },
    { status: 200, headers: responseHeaders(args.requestId, args.rateMeta ?? undefined) }
  );
}

export function buildReviewSuccessResponse(args: {
  requestId: string;
  clientMode: ClientMode;
  review: ReviewResult;
  sessionId: string;
  creditsCharged: number;
  creditsRemaining: number | null;
  usage: UsagePayload;
  rateMeta: RateMeta | null;
  repaired?: boolean;
} & SharedArtifactPayload &
  SharedExecutionPayload &
  SharedReleaseHealthPayload) {
  return NextResponse.json(
    {
      ok: true,
      mode: args.clientMode,
      review: args.review,
      sessionId: args.sessionId,
      creditsCharged: args.creditsCharged,
      creditsRemaining: args.creditsRemaining,
      usage: args.usage,
      rate: args.rateMeta,
      repaired: args.repaired || undefined,

      // M12.13 / M12.14:
      // Surface the full normalized execution artifact as-is.
      // This now includes deterministic failureSummary when available.
      executionIntelligence: args.executionIntelligence ?? undefined,

      // M12.15:
      // Surface the normalized release health artifact as-is.
      // This layer remains transport-only and does not interpret health rules.
      releaseHealth: args.releaseHealth ?? undefined,

      artifact: args.artifact,
      artifactUpdatedAt: args.artifactUpdatedAt,
    },
    { status: 200, headers: responseHeaders(args.requestId, args.rateMeta ?? undefined) }
  );
}

export function buildChatSuccessResponse(args: {
  requestId: string;
  clientMode: ClientMode;
  reply: string;
  coach: CoachResult | null;
  sessionId: string;
  creditsCharged: number;
  creditsRemaining: number | null;
  usage: UsagePayload;
  rateMeta: RateMeta | null;
  workflowGuidance?: WorkflowGuidance | null;
} & SharedArtifactPayload &
  SharedExecutionPayload &
  SharedReleaseHealthPayload) {
  return NextResponse.json(
    {
      ok: true,
      mode: args.clientMode,
      reply: args.reply,
      coach: args.coach,
      sessionId: args.sessionId,
      creditsCharged: args.creditsCharged,
      creditsRemaining: args.creditsRemaining,
      usage: args.usage,
      rate: args.rateMeta,
      workflowGuidance: args.workflowGuidance ?? undefined,

      // M12.13 / M12.14:
      // Keep responseBuilder generic and transport-only.
      // Client receives classification-aware execution payload without
      // this layer knowing any classification rules.
      executionIntelligence: args.executionIntelligence ?? undefined,

      // M12.15:
      // Client receives deterministic release health payload without
      // this layer owning any release health computation logic.
      releaseHealth: args.releaseHealth ?? undefined,

      artifact: args.artifact,
      artifactUpdatedAt: args.artifactUpdatedAt,
    },
    { status: 200, headers: responseHeaders(args.requestId, args.rateMeta ?? undefined) }
  );
}

export function buildAuthExpiredResponse(args: {
  requestId: string;
  rateMeta: RateMeta | null;
} & SharedArtifactPayload) {
  return NextResponse.json(
    {
      ok: false,
      error: "Session expired",
      details: "Your sign-in session expired. Please sign in again to continue.",
      ...(args.rateMeta ? { rate: args.rateMeta } : {}),
      artifact: args.artifact,
      artifactUpdatedAt: args.artifactUpdatedAt,
    },
    { status: 401, headers: responseHeaders(args.requestId, args.rateMeta ?? undefined) }
  );
}

export function buildChatPreconditionErrorResponse(args: {
  requestId: string;
  errorMessage: string;
  rateMeta: RateMeta | null;
} & SharedArtifactPayload) {
  return NextResponse.json(
    {
      ok: false,
      error: "Workflow precondition failed",
      details: args.errorMessage,
      ...(args.rateMeta ? { rate: args.rateMeta } : {}),
      artifact: args.artifact,
      artifactUpdatedAt: args.artifactUpdatedAt,
    },
    { status: 400, headers: responseHeaders(args.requestId, args.rateMeta ?? undefined) }
  );
}

export function buildServerErrorResponse(args: {
  requestId: string;
  rateMeta: RateMeta | null;
} & SharedArtifactPayload) {
  return buildInternalServerErrorResponse({
    requestId: args.requestId,
    headers: responseHeaders(args.requestId, args.rateMeta ?? undefined),
  });
}
