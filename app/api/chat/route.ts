// ===========================
// ✅ /api/chat (production)
// - Auth0 session required (API not public)
// - Upstash per-user rate limiting
// - RBAC: Review mode is admin-only (roles claim in Access Token)
// ===========================
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { QA_SYSTEM_PROMPT } from "@/lib/framework/systemPrompt";
import { isReviewResult } from "@/lib/framework/reviewSchema";
import { auth0 } from "@/lib/auth0";

// ---------------------------
// RBAC: Auth0 Post-Login Action must set this claim in Access Token:
// api.accessToken.setCustomClaim("https://stefans-mvp/claims/roles", roles)
// ---------------------------
const ROLES_CLAIM = "https://stefans-mvp/claims/roles";
const ADMIN_ROLE = "admin";

// ---------------------------
// Rate limiting (global across Vercel instances)
// Env vars required (local + Vercel):
// - UPSTASH_REDIS_REST_URL
// - UPSTASH_REDIS_REST_TOKEN
// ---------------------------
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

// ---------------------------
// OpenAI client (server-side only)
// ---------------------------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Mode = "coach" | "review";

type RateMeta = {
  limit: number;
  remaining: number;
  resetSeconds: number;
};

/**
 * Fallback identifier (only used if Auth0 `sub` is missing).
 * This should be rare because we require a session.
 */
function getIpIdentifier(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return `ip:${xff.split(",")[0].trim()}`;

  const xrip = req.headers.get("x-real-ip");
  if (xrip) return `ip:${xrip.trim()}`;

  return "ip:unknown";
}

/** Attach standard rate-limit headers consistently. */
function rateHeaders(meta: RateMeta, retryAfterSec?: number) {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(meta.limit),
    "X-RateLimit-Remaining": String(meta.remaining),
    "X-RateLimit-Reset": String(meta.resetSeconds),
  };

  if (retryAfterSec && retryAfterSec > 0) headers["Retry-After"] = String(retryAfterSec);
  return headers;
}

/**
 * Decode JWT payload without signature verification.
 * We only use this to read claims from the Access Token obtained server-side via Auth0.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Get roles from the Access Token custom claim.
 * In Auth0 Next.js SDK v4, session.user may not include namespaced custom claims,
 * so Access Token is the reliable source for RBAC enforcement.
 */
async function getRolesFromAccessToken(): Promise<string[]> {
  const tokenResult = await auth0.getAccessToken();
  const token = tokenResult?.token;

  // If token is missing or not a JWT, treat as no roles.
  if (!token || token.split(".").length !== 3) return [];

  const claims = decodeJwtPayload(token);
  const rolesValue = claims?.[ROLES_CLAIM];
  return Array.isArray(rolesValue) ? (rolesValue as string[]) : [];
}

export async function POST(req: Request) {
  let rateMeta: RateMeta | null = null;

  try {
    // ===========================
    // 0) Require Auth0 session (API is not public)
    // ===========================
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Prefer per-user rate limiting (best practice)
    const sub = session.user.sub as string | undefined;
    const identifier = sub ? `user:${sub}` : getIpIdentifier(req);

    // ===========================
    // 1) Parse request
    // ===========================
    const body = (await req.json()) as { message?: string; mode?: Mode };
    const message = body?.message;
    const mode: Mode = body?.mode === "review" ? "review" : "coach";

    // ===========================
    // 2) Safety guard: API key must exist
    // ===========================
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is not set (check .env.local and restart dev server)" },
        { status: 500 }
      );
    }

    // ===========================
    // 3) Validate input early
    // ===========================
    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false, error: "Missing 'message' (must be a string)" }, { status: 400 });
    }

    // ===========================
    // 4) Cost/abuse guard: cap input size
    // ===========================
    if (message.length > 8000) {
      return NextResponse.json({ ok: false, error: "Message too long (max 8000 characters)" }, { status: 400 });
    }

    // ===========================
    // 5) RBAC: Review mode is admin-only (server enforced)
    // ===========================
    if (mode === "review") {
      const roles = await getRolesFromAccessToken();
      if (!roles.includes(ADMIN_ROLE)) {
        return NextResponse.json({ ok: false, mode, error: "Forbidden" }, { status: 403 });
      }
    }

    // ===========================
    // 6) Rate limit (Upstash)
    // ===========================
    const { success, remaining, reset } = await ratelimit.limit(identifier);

    const resetSeconds =
      typeof reset === "number" ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 60;

    rateMeta = {
      limit: RATE_LIMIT.limit,
      remaining: typeof remaining === "number" ? remaining : 0,
      resetSeconds,
    };

    if (!success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Rate limit exceeded",
          details: `Too many requests. Try again in ~${resetSeconds}s.`,
          rate: { ...rateMeta, remaining: 0 },
        },
        { status: 429, headers: rateHeaders({ ...rateMeta, remaining: 0 }, resetSeconds) }
      );
    }

    // ===========================
    // 7) Mode-specific instruction
    // ===========================
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

    // ===========================
    // 8) Call the model
    // ===========================
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

    // ===========================
    // 9) Extract reply
    // ===========================
    const reply = completion.choices[0]?.message?.content ?? "No reply returned";

    // ===========================
    // 10) REVIEW mode: parse model output as JSON
    // ===========================
    if (mode === "review") {
      const raw = reply.trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const jsonText = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;

      try {
        const parsed = JSON.parse(jsonText);

        if (!isReviewResult(parsed)) {
          return NextResponse.json(
            { ok: false, mode, error: "Invalid review JSON shape", raw: reply, rate: rateMeta },
            { status: 200, headers: rateHeaders(rateMeta) }
          );
        }

        return NextResponse.json(
          { ok: true, mode, review: parsed, rate: rateMeta },
          { status: 200, headers: rateHeaders(rateMeta) }
        );
      } catch {
        return NextResponse.json(
          { ok: false, mode, error: "Failed to parse review JSON", raw: reply, rate: rateMeta },
          { status: 200, headers: rateHeaders(rateMeta) }
        );
      }
    }

    // ===========================
    // 11) Coach mode returns plain text
    // ===========================
    return NextResponse.json({ ok: true, mode, reply, rate: rateMeta }, { status: 200, headers: rateHeaders(rateMeta) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown server error";

    return NextResponse.json(
      { ok: false, error: "Server error", details: message, ...(rateMeta ? { rate: rateMeta } : {}) },
      { status: 500, ...(rateMeta ? { headers: rateHeaders(rateMeta) } : {}) }
    );
  }
}
