// lib/logger.ts
/**
 * Minimal structured logger for Vercel/Node runtimes.
 * Emits JSON per line so logs are searchable/parsable in Vercel + log drains.
 *
 * Usage:
 * log("info", { requestId, event: "chat_request", ... })
 */

export type LogLevel = "info" | "warn" | "error";

export type LogEvent =
  | "chat_request"
  | "chat_completed"
  | "forbidden_review_access"
  | "rate_limit_exceeded"
  | "unauthorized"
  | "chat_error";

export type LogPayload = {
  requestId: string;
  event: LogEvent;

  userId?: string;
  mode?: string;

  latencyMs?: number;
  error?: string;

  // Keep meta small (avoid dumping payloads / PII)
  meta?: Record<string, unknown>;
};

export function log(level: LogLevel, payload: LogPayload) {
  const entry = {
    level,
    ts: new Date().toISOString(),
    ...payload,
  };

  // Vercel captures console output; JSON makes logs easy to query/filter.
  // Using console[level] helps Vercel classify logs.
  // eslint-disable-next-line no-console
  (console[level] ?? console.log)(JSON.stringify(entry));
}
