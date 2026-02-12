// lib/metrics/chatMetrics.ts
/**
 * Redis-backed chat metrics.
 * We write small counters to 5-minute buckets and keep TTL for easy rollups.
 */

import { Redis } from "@upstash/redis";

export type ChatMetricMode = "coach" | "review" | "unknown";
export type ChatMetricStatus = 200 | 400 | 401 | 403 | 429 | 500;

const redis = Redis.fromEnv();

function bucketKey(nowMs: number) {
  const bucketSeconds = Math.floor(nowMs / 1000 / 300) * 300; // 5-minute buckets
  return `metrics:chat:bucket:${bucketSeconds}`;
}

/**
 * Record per-request metrics.
 * Important: metrics must NEVER block request handling.
 */
export async function recordChatMetric(input: {
  nowMs: number;
  mode: ChatMetricMode;
  status: ChatMetricStatus;
  latencyMs: number;
  rateLimited?: boolean;
}) {
  try {
    const key = bucketKey(input.nowMs);

    const modeField =
      input.mode === "coach"
        ? "mode_coach"
        : input.mode === "review"
          ? "mode_review"
          : "mode_unknown";

    const statusField = `status_${input.status}`;
    const latency = Math.max(0, Math.floor(input.latencyMs));

    const pipeline = redis.pipeline();
    pipeline.hincrby(key, "total", 1);
    pipeline.hincrby(key, modeField, 1);
    pipeline.hincrby(key, statusField, 1);
    pipeline.hincrby(key, "latency_sum_ms", latency);
    pipeline.hincrby(key, "latency_count", 1);

    if (input.rateLimited) pipeline.hincrby(key, "rate_limited", 1);

    // Keep buckets long enough to read last 60m with slack
    pipeline.expire(key, 60 * 60 * 2); // 2 hours
    await pipeline.exec();
  } catch {
    // Swallow metrics failures by design.
  }
}
