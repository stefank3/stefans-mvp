// app/api/admin/metrics/route.ts
/**
 * Admin-only metrics endpoint.
 * Reads Redis bucket counters written by /api/chat.
 *
 * Output:
 * - totals: aggregate stats over last 60 minutes
 * - series: 12 points (5-min buckets)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

import { auth0 } from "@/lib/auth0";
import { isAdminFromAccessToken } from "@/lib/auth/rbac";

const redis = Redis.fromEnv();

function headersWithRequestId(requestId: string) {
  return { "X-Request-Id": requestId };
}

function bucketKey(bucketSeconds: number) {
  return `metrics:chat:bucket:${bucketSeconds}`;
}

export async function GET(req: Request) {
  const inbound = req.headers.get("x-request-id");
  const requestId = inbound && inbound.length < 200 ? inbound : randomUUID();

  // 1) Require session
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: headersWithRequestId(requestId) }
    );
  }

  // 2) Admin-only
  const isAdmin = await isAdminFromAccessToken();
  if (!isAdmin) {
    return NextResponse.json(
      { ok: false, error: "Forbidden" },
      { status: 403, headers: headersWithRequestId(requestId) }
    );
  }

  // 3) Read last 60 minutes (5-min buckets => 12 buckets)
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBucket = Math.floor(nowSec / 300) * 300;

  const buckets: number[] = [];
  for (let i = 0; i < 12; i++) buckets.push(currentBucket - i * 300);

  const pipeline = redis.pipeline();
  for (const b of buckets) pipeline.hgetall(bucketKey(b));
  const rows = await pipeline.exec();

  // 4) Aggregate totals
  const totals = {
    total: 0,
    mode_coach: 0,
    mode_review: 0,
    mode_unknown: 0,
    status_200: 0,
    status_400: 0,
    status_401: 0,
    status_403: 0,
    status_429: 0,
    status_500: 0,
    rate_limited: 0,
    latency_sum_ms: 0,
    latency_count: 0,
  };

  const series = buckets
    .slice()
    .reverse()
    .map((bucketSeconds, idx) => {
      const raw = (rows?.[idx] as Record<string, unknown>) || {};
      const get = (k: keyof typeof totals) => Number(raw[k] ?? 0) || 0;

      const point = {
        bucketSeconds,
        total: get("total"),
        coach: get("mode_coach"),
        review: get("mode_review"),
        status200: get("status_200"),
        status403: get("status_403"),
        status429: get("status_429"),
        status500: get("status_500"),
        rateLimited: get("rate_limited"),
        avgLatencyMs: get("latency_count") > 0
          ? Math.round(get("latency_sum_ms") / get("latency_count"))
          : 0,
      };

      totals.total += get("total");
      totals.mode_coach += get("mode_coach");
      totals.mode_review += get("mode_review");
      totals.mode_unknown += get("mode_unknown");

      totals.status_200 += get("status_200");
      totals.status_400 += get("status_400");
      totals.status_401 += get("status_401");
      totals.status_403 += get("status_403");
      totals.status_429 += get("status_429");
      totals.status_500 += get("status_500");

      totals.rate_limited += get("rate_limited");
      totals.latency_sum_ms += get("latency_sum_ms");
      totals.latency_count += get("latency_count");

      return point;
    });

  const avgLatencyMs =
    totals.latency_count > 0 ? Math.round(totals.latency_sum_ms / totals.latency_count) : 0;

  return NextResponse.json(
    {
      ok: true,
      windowMinutes: 60,
      totals: {
        total: totals.total,
        coach: totals.mode_coach,
        review: totals.mode_review,
        unknown: totals.mode_unknown,
        status: {
          200: totals.status_200,
          400: totals.status_400,
          401: totals.status_401,
          403: totals.status_403,
          429: totals.status_429,
          500: totals.status_500,
        },
        rateLimited: totals.rate_limited,
        avgLatencyMs,
      },
      series,
    },
    { status: 200, headers: headersWithRequestId(requestId) }
  );
}
