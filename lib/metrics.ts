// lib/metrics.ts
import { Redis } from "@upstash/redis";

export type ChatMetricStatus = 200 | 400 | 401 | 403 | 429 | 500;
export type ChatMetricMode = "coach" | "review" | "unknown";

const redis = Redis.fromEnv();

/**
 * We store metrics in 5-minute buckets.
 * Key example: metrics:chat:bucket:1700000000  (epoch seconds rounded down to 5 min)
 * Hash fields: total, mode_coach, mode_review, status_200, ..., latency_sum_ms, latency_count
 */
function bucketKey(nowMs: number) {
  const bucketSeconds = Math.floor(nowMs / 1000 / 300) * 300; // 300s = 5 minutes
  return `metrics:chat:bucket:${bucketSeconds}`;
}

/**
 * Record one request’s metrics. Uses Redis hash increments (cheap).
 * TTL is 2 hours so old buckets disappear automatically.
 */
export async function recordChatMetric(input: {
  nowMs: number;
  mode: ChatMetricMode;
  status: ChatMetricStatus;
  latencyMs: number;
  rateLimited?: boolean;
}) {
  const key = bucketKey(input.nowMs);

  const modeField =
    input.mode === "coach" ? "mode_coach" : input.mode === "review" ? "mode_review" : "mode_unknown";

  const statusField = `status_${input.status}`;

  const pipeline = redis.pipeline();
  pipeline.hincrby(key, "total", 1);
  pipeline.hincrby(key, modeField, 1);
  pipeline.hincrby(key, statusField, 1);

  // latency aggregation
  pipeline.hincrby(key, "latency_sum_ms", Math.max(0, Math.floor(input.latencyMs)));
  pipeline.hincrby(key, "latency_count", 1);

  if (input.rateLimited) {
    pipeline.hincrby(key, "rate_limited", 1);
  }

  // Keep buckets around briefly (enough to aggregate last 60 minutes + slack)
  pipeline.expire(key, 60 * 60 * 2); // 2 hours

  await pipeline.exec();
}
