import { NextResponse } from "next/server";
import OpenAI from "openai";
import { QA_SYSTEM_PROMPT } from "@/lib/framework/systemPrompt";
import { isReviewResult } from "@/lib/framework/reviewSchema";


/**
 * Create a single OpenAI client instance for this server runtime.
 * - This runs ONLY on the server (API route).
 * - The API key is read from process.env (loaded from .env.local).
 */
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Mode = "coach" | "review";

/**
 * POST /api/chat
 * Request body:
 * {
 *   message: string,
 *   mode?: "coach" | "review"
 * }
 *
 * Response:
 * {
 *   ok: boolean,
 *   mode: "coach" | "review",
 *   reply?: string,
 *   error?: string
 * }
 */

/**
 * Simple in-memory rate limiter (MVP).
 * - Per-IP sliding window
 * - Works well for demos and small usage
 * - On Vercel, this is per-instance (not globally shared)
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX_REQUESTS = 20; // max requests per window per IP

// Map<ip, timestamps[]>
const ipBuckets = new Map<string, number[]>();

function getClientIp(req: Request) {
  // Vercel / proxies usually set this:
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  // Some platforms use this:
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();

  // Fallback
  return "unknown";
}

function rateLimitOrThrow(ip: string) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const existing = ipBuckets.get(ip) ?? [];
  // Keep only timestamps inside the window
  const fresh = existing.filter((t) => t > windowStart);

  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = fresh[0] - windowStart; // when oldest falls out
    return { allowed: false as const, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  fresh.push(now);
  ipBuckets.set(ip, fresh);
  return { allowed: true as const, retryAfterSec: 0 };
}

export async function POST(req: Request) {
  try {
    // 1) Parse incoming request JSON
    const body = (await req.json()) as { message?: string; mode?: Mode };

    const message = body?.message;
    const mode: Mode = body?.mode === "review" ? "review" : "coach";

    // 2) Safety guard: ensure server has the API key.
    //    If this fails, Step 1 wasn't loaded correctly or server wasn't restarted.
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is not set (check .env.local and restart dev server)" },
        { status: 500 }
      );
    }

    // 3) Validate input early. (Avoid calling the model with invalid payload.)
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing 'message' (must be a string)" },
        { status: 400 }
      );
    }

    // 4) Basic cost/abuse guard: prevent huge inputs from exploding costs.
    //    You can tune this later; it's just a practical MVP constraint.
    if (message.length > 8000) {
      return NextResponse.json(
        { ok: false, error: "Message too long (max 8000 characters)" },
        { status: 400 }
      );
    }

    // 5) Mode-specific instruction:
    //    We keep the global QA philosophy in QA_SYSTEM_PROMPT,
    //    and add short mode guidance here.
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
    
    // 5) Rate limit (protect tokens / prevent abuse)
    const ip = getClientIp(req);
    const rl = rateLimitOrThrow(ip);

    if (!rl.allowed) {
    return NextResponse.json(
        {
        ok: false,
        error: "Rate limit exceeded",
        details: `Too many requests. Try again in ~${rl.retryAfterSec}s.`,
        },
        {
        status: 429,
        headers: {
            "Retry-After": String(rl.retryAfterSec),
        },
        }
    );
    }

    // 6) Call the model (server-side)
    //    max_tokens is a HARD COST CAP per request
    const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,

    // ✅ COST CONTROL (IMPORTANT)
    // Review mode is JSON-only → smaller output
    // Coach mode may explain a bit more
    max_tokens: mode === "review" ? 500 : 700,

    messages: [
        { role: "system", content: QA_SYSTEM_PROMPT },
        { role: "system", content: modeInstruction },
        { role: "user", content: message },
    ],
    });


    // 7) Extract reply safely.
    const reply = completion.choices[0]?.message?.content ?? "No reply returned";
    // 8) If we're in REVIEW mode, parse the model output as JSON and return structured data.
    //    This enables the UI to render a scorecard instead of plain text.
    if (mode === "review") {
      const raw = reply.trim();

      // Some responses may include extra text; try to extract the first JSON object.
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");

      const jsonText = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;

      try {
        const parsed = JSON.parse(jsonText);

        // Validate shape to protect UI rendering.
        if (!isReviewResult(parsed)) {
          return NextResponse.json(
            { ok: false, mode, error: "Invalid review JSON shape", raw: reply },
            { status: 200 }
          );
        }

        return NextResponse.json({ ok: true, mode, review: parsed });
      } catch {
        return NextResponse.json(
          { ok: false, mode, error: "Failed to parse review JSON", raw: reply },
          { status: 200 }
        );
      }
    }

     // 9) Coach mode returns plain text.
    return NextResponse.json({ ok: true, mode, reply });
  } catch (e: any) {
    // Any unexpected runtime error gets wrapped into a JSON response.
    return NextResponse.json(
      { ok: false, error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
  
}
