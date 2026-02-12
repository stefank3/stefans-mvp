// app/api/chat/route.ts
// ===========================
// ✅ /api/chat (production + observability + metrics)
// - Auth0 session required (API not public)
// - Upstash per-user rate limiting
// - RBAC: Review mode is admin-only (roles claim in Access Token)
// - Observability: requestId correlation + latency + structured logs
// - Metrics: Redis bucket counters (5-min buckets)
// ===========================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

import OpenAI from "openai";
import { NextResponse } from "next/server";

import { auth0 } from "@/lib/auth0";
import { log } from "@/lib/logger";
import { QA_SYSTEM_PROMPT } from "@/lib/framework/systemPrompt";
import { isReviewResult } from "@/lib/framework/reviewSchema";
import { isAdminFromAccessToken } from "@/lib/auth/rbac";
import { recordChatMetric, type ChatMetricMode } from "@/lib/metrics/chatMetrics";

const redis = Redis.fromEnv();

const RATE_LIMIT = {
  limit: 20,
  window: "60 s" as const,
  prefix: "stefans-mvp:chat",
} as const;

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT.limit, RATE_LIMIT.window),
  analytics: true,
  prefix: RATE_LIMIT.prefix,
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Mode = "coach" | "review";

type RateMeta = {
  limit: number;
  remaining: number;
  resetSeconds: number;
};

/**
 * Fallback identifier (only used if Auth0 `sub` is missing).
 * Should be rare because we require session.
 */
function getIpIdentifier(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return `ip:${xff.split(",")[0].trim()}`;

  const xrip = req.headers.get("x-real-ip");
  if (xrip) return `ip:${xrip.trim()}`;

  return "ip:unknown";
}

/**
 * Standard response headers:
 * - Always includes X-Request-Id for correlation
 * - Optionally includes rate-limit headers
 */
function responseHeaders(requestId: string, meta?: RateMeta, retryAfterSec?: number) {
  const headers: Record<string, string> = { "X-Request-Id": requestId };

  if (meta) {
    headers["X-RateLimit-Limit"] = String(meta.limit);
    headers["X-RateLimit-Remaining"] = String(meta.remaining);
    headers["X-RateLimit-Reset"] = String(meta.resetSeconds);
  }

  if (retryAfterSec && retryAfterSec > 0) headers["Retry-After"] = String(retryAfterSec);

  return headers;
}

export async function POST(req: Request) {
  const inbound = req.headers.get("x-request-id");
  const requestId = inbound && inbound.length < 200 ? inbound : randomUUID();

  const startTime = Date.now();

  let userId: string | undefined;
  let modeForLog: ChatMetricMode = "unknown";
  let rateMeta: RateMeta | null = null;

  try {
    // 0) Require Auth0 session
    const session = await auth0.getSession();
    if (!session?.user) {
      log("warn", { requestId, event: "unauthorized", mode: modeForLog, meta: { path: "/api/chat" } });

      await recordChatMetric({
        nowMs: Date.now(),
        mode: modeForLog,
        status: 401,
        latencyMs: Date.now() - startTime,
      });

      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: responseHeaders(requestId) }
      );
    }

    userId = (session.user.sub as string | undefined) ?? "unknown";
    const identifier = userId !== "unknown" ? `user:${userId}` : getIpIdentifier(req);

    // 1) Parse request
    const body = (await req.json()) as { message?: string; mode?: Mode };
    const message = body?.message;
    const mode: Mode = body?.mode === "review" ? "review" : "coach";
    modeForLog = mode;

    log("info", {
      requestId,
      event: "chat_request",
      userId,
      mode,
      meta: { messageChars: typeof message === "string" ? message.length : 0 },
    });

    // 2) Ensure OpenAI key exists
    if (!process.env.OPENAI_API_KEY) {
      log("error", { requestId, event: "chat_error", userId, mode, error: "OPENAI_API_KEY is not set" });

      await recordChatMetric({
        nowMs: Date.now(),
        mode,
        status: 500,
        latencyMs: Date.now() - startTime,
      });

      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is not set (check env vars)" },
        { status: 500, headers: responseHeaders(requestId) }
      );
    }

    // 3) Validate input
    if (!message || typeof message !== "string") {
      await recordChatMetric({
        nowMs: Date.now(),
        mode,
        status: 400,
        latencyMs: Date.now() - startTime,
      });

      return NextResponse.json(
        { ok: false, error: "Missing 'message' (must be a string)" },
        { status: 400, headers: responseHeaders(requestId) }
      );
    }

    if (message.length > 8000) {
      await recordChatMetric({
        nowMs: Date.now(),
        mode,
        status: 400,
        latencyMs: Date.now() - startTime,
      });

      return NextResponse.json(
        { ok: false, error: "Message too long (max 8000 characters)" },
        { status: 400, headers: responseHeaders(requestId) }
      );
    }

    // 4) RBAC: review is admin-only
    if (mode === "review") {
      const isAdmin = await isAdminFromAccessToken();
      if (!isAdmin) {
        log("warn", { requestId, event: "forbidden_review_access", userId, mode });

        await recordChatMetric({
          nowMs: Date.now(),
          mode,
          status: 403,
          latencyMs: Date.now() - startTime,
        });

        return NextResponse.json(
          { ok: false, mode, error: "Forbidden" },
          { status: 403, headers: responseHeaders(requestId) }
        );
      }
    }

    // 5) Rate limit (Upstash)
    const { success, remaining, reset } = await ratelimit.limit(identifier);

    const resetSeconds =
      typeof reset === "number" ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60;

    rateMeta = {
      limit: RATE_LIMIT.limit,
      remaining: typeof remaining === "number" ? remaining : 0,
      resetSeconds,
    };

    if (!success) {
      log("warn", { requestId, event: "rate_limit_exceeded", userId, mode, meta: { resetSeconds } });

      await recordChatMetric({
        nowMs: Date.now(),
        mode,
        status: 429,
        latencyMs: Date.now() - startTime,
        rateLimited: true,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Rate limit exceeded",
          details: `Too many requests. Try again in ~${resetSeconds}s.`,
          rate: { ...rateMeta, remaining: 0 },
        },
        {
          status: 429,
          headers: responseHeaders(requestId, { ...rateMeta, remaining: 0 }, resetSeconds),
        }
      );
    }

    // 6) Mode-specific prompt
    const modeInstruction =
      mode === "review"
        ? [
            "MODE: REVIEW & SCORING",
            "Return ONLY valid JSON. No markdown. No prose outside JSON.",
            "Schema:",
            "{",
            '  "score": number (0-100),',
            '  "verdict": string,',
            '  "breakdown": {',
            '    "businessRelevance": number (0-25),',
            '    "riskCoverage": number (0-25),',
            '    "designQuality": number (0-20),',
            '    "levelAndScope": number (0-15),',
            '    "diagnosticValue": number (0-15)',
            "  },",
            '  "riskGaps": string[],',
            '  "antiPatterns": string[],',
            '  "improvements": string[]',
            "}",
            "Rules:",
            "- Ensure breakdown sums to score OR is consistent with score.",
            "- riskGaps and improvements must be actionable and specific.",
            "- Keep each list <= 6 items.",
          ].join("\n")
        : [
            "MODE: COACH",
            "If requirements are vague: ask up to 6 clarifying questions first.",
            "Then propose a risk-based test strategy and a SMALL set of high-signal tests.",
            "Prefer unit/API over UI when appropriate.",
          ].join("\n");

    // 7) Call model
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: mode === "review" ? 500 : 700,
      messages: [
        { role: "system", content: QA_SYSTEM_PROMPT },
        { role: "system", content: modeInstruction },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? "No reply returned";

    // 8) REVIEW: parse JSON
    if (mode === "review") {
      const raw = reply.trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const jsonText = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;

      try {
        const parsed = JSON.parse(jsonText);

        if (!isReviewResult(parsed)) {
          log("warn", {
            requestId,
            event: "chat_completed",
            userId,
            mode,
            latencyMs: Date.now() - startTime,
            meta: { reviewParse: "invalid_shape" },
          });

          await recordChatMetric({
            nowMs: Date.now(),
            mode,
            status: 200,
            latencyMs: Date.now() - startTime,
          });

          return NextResponse.json(
            { ok: false, mode, error: "Invalid review JSON shape", raw: reply, rate: rateMeta },
            { status: 200, headers: responseHeaders(requestId, rateMeta ?? undefined) }
          );
        }

        log("info", { requestId, event: "chat_completed", userId, mode, latencyMs: Date.now() - startTime });

        await recordChatMetric({
          nowMs: Date.now(),
          mode,
          status: 200,
          latencyMs: Date.now() - startTime,
        });

        return NextResponse.json(
          { ok: true, mode, review: parsed, rate: rateMeta },
          { status: 200, headers: responseHeaders(requestId, rateMeta ?? undefined) }
        );
      } catch {
        log("warn", {
          requestId,
          event: "chat_completed",
          userId,
          mode,
          latencyMs: Date.now() - startTime,
          meta: { reviewParse: "json_parse_failed" },
        });

        await recordChatMetric({
          nowMs: Date.now(),
          mode,
          status: 200,
          latencyMs: Date.now() - startTime,
        });

        return NextResponse.json(
          { ok: false, mode, error: "Failed to parse review JSON", raw: reply, rate: rateMeta },
          { status: 200, headers: responseHeaders(requestId, rateMeta ?? undefined) }
        );
      }
    }

    // 9) COACH: return text
    log("info", { requestId, event: "chat_completed", userId, mode, latencyMs: Date.now() - startTime });

    await recordChatMetric({
      nowMs: Date.now(),
      mode,
      status: 200,
      latencyMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { ok: true, mode, reply, rate: rateMeta },
      { status: 200, headers: responseHeaders(requestId, rateMeta ?? undefined) }
    );
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "Unknown server error";

    log("error", {
      requestId,
      event: "chat_error",
      userId,
      mode: modeForLog,
      error: errMsg,
      meta: { latencyMs: Date.now() - startTime },
    });

    await recordChatMetric({
      nowMs: Date.now(),
      mode: modeForLog,
      status: 500,
      latencyMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { ok: false, error: "Server error", details: errMsg, ...(rateMeta ? { rate: rateMeta } : {}) },
      { status: 500, headers: responseHeaders(requestId, rateMeta ?? undefined) }
    );
  }
}
