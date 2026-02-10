// ===========================
// ✅ Step 3.2.2: Protect /api/chat with Auth0 session + per-user rate limiting
// ===========================
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { QA_SYSTEM_PROMPT } from "@/lib/framework/systemPrompt";
import { isReviewResult } from "@/lib/framework/reviewSchema";

// ✅ ADDED: Use your v4 Auth0 client
import { auth0 } from "@/lib/auth0";

// ---------------------------
// ✅ Upstash Redis-backed limiter (global across Vercel instances)
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

/**
 * Create a single OpenAI client instance for this server runtime.
 */
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Mode = "coach" | "review";

type RateMeta = {
  limit: number;
  remaining: number;
  resetSeconds: number;
};

/**
 * Fallback identifier (only used if Auth0 sub is missing).
 */
function getIpIdentifier(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return `ip:${xff.split(",")[0].trim()}`;

  const xrip = req.headers.get("x-real-ip");
  if (xrip) return `ip:${xrip.trim()}`;

  return "ip:unknown";
}

function rateHeaders(meta: RateMeta, retryAfterSec?: number) {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(meta.limit),
    "X-RateLimit-Remaining": String(meta.remaining),
    "X-RateLimit-Reset": String(meta.resetSeconds),
  };

  if (retryAfterSec && retryAfterSec > 0) {
    headers["Retry-After"] = String(retryAfterSec);
  }

  return headers;
}

export async function POST(req: Request) {
  let rateMeta: RateMeta | null = null;

  try {
    // ===========================
    // ✅ Step 3.2.2: Require Auth0 session
    // ===========================
    const session = await auth0.getSession();

    // No session => API is protected (even if someone calls it directly)
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Prefer per-user rate limiting (best practice)
    const sub = session.user.sub as string | undefined;
    const identifier = sub ? `user:${sub}` : getIpIdentifier(req);

    // ===========================
    // 1) Parse incoming request JSON
    // ===========================
    const body = (await req.json()) as { message?: string; mode?: Mode };

    const message = body?.message;
    const mode: Mode = body?.mode === "review" ? "review" : "coach";

    // 2) Safety guard: ensure server has the API key.
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "OPENAI_API_KEY is not set (check .env.local and restart dev server)",
        },
        { status: 500 }
      );
    }

    // 3) Validate input early.
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing 'message' (must be a string)" },
        { status: 400 }
      );
    }

    // 4) Basic cost/abuse guard: prevent huge inputs from exploding costs.
    if (message.length > 8000) {
      return NextResponse.json(
        { ok: false, error: "Message too long (max 8000 characters)" },
        { status: 400 }
      );
    }

    // ===========================
    // 5) ✅ Global rate limit (Upstash) — now keyed by user
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
        {
          status: 429,
          headers: rateHeaders({ ...rateMeta, remaining: 0 }, resetSeconds),
        }
      );
    }

    // 6) Mode-specific instruction
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

    // 7) Call the model
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

    // 8) Extract reply safely.
    const reply = completion.choices[0]?.message?.content ?? "No reply returned";

    // 9) REVIEW mode: parse model output as JSON
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

    // 10) Coach mode returns plain text.
    return NextResponse.json(
      { ok: true, mode, reply, rate: rateMeta },
      { status: 200, headers: rateHeaders(rateMeta) }
    );
  } catch (e: unknown) {
  const message =
    e instanceof Error ? e.message : "Unknown server error";

  return NextResponse.json(
    {
      ok: false,
      error: "Server error",
      details: message,
      ...(rateMeta ? { rate: rateMeta } : {}),
    },
    { status: 500, ...(rateMeta ? { headers: rateHeaders(rateMeta) } : {}) }
  );
}
}
