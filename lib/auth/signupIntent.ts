import "server-only";

import { env } from "@/lib/env";
import { key, redis } from "@/lib/redis";

export const SIGNUP_INTENT_COOKIE_NAME = "rs_beta_signup";
export const SIGNUP_INTENT_TTL_SECONDS = 15 * 60;

const INTENT_PURPOSE = "beta_signup";
const INTENT_KEY_VERSION = "v1";
const PENDING_VALUE = `${INTENT_PURPOSE}:pending`;
const CALLBACK_MARKER_PATH = "/auth/start-trial/complete";
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_NONCE_COLLISION_RETRIES = 3;

const BIND_INTENT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return 0
end
local ttl = redis.call("TTL", KEYS[1])
if ttl <= 1 then
  return 0
end
if current == ARGV[1] then
  redis.call("SET", KEYS[1], ARGV[2], "KEEPTTL")
  return ttl
end
if current == ARGV[2] then
  return ttl
end
return -1
`;

const CONSUME_BOUND_INTENT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const DELETE_PENDING_INTENT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export type SignupIntentResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable" };

export type SignupIntentBindingResult =
  | { ok: true; expiresInSeconds: number }
  | { ok: false; reason: "invalid" | "unavailable" };

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signupIntentKey(nonce: string): Promise<string> {
  const nonceHash = await sha256Hex(nonce);
  return key(`auth:signup-intent:${INTENT_KEY_VERSION}:${nonceHash}`);
}

async function subjectHash(auth0Sub: string): Promise<string> {
  return sha256Hex(`release-signal:signup-intent-sub:v1:${auth0Sub}`);
}

async function boundValue(auth0Sub: string): Promise<string> {
  return `${INTENT_PURPOSE}:bound:${await subjectHash(auth0Sub)}`;
}

export function isValidSignupIntentNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE_PATTERN.test(value);
}

export function buildSignupIntentCallbackMarker(nonce: string): string {
  if (!isValidSignupIntentNonce(nonce)) {
    throw new Error("Invalid signup intent nonce");
  }

  const marker = new URL(CALLBACK_MARKER_PATH, env.APP_BASE_URL);
  marker.searchParams.set("intent", nonce);
  return `${marker.pathname}${marker.search}`;
}

export function isSignupIntentCallbackMarker(returnTo?: string): boolean {
  if (!returnTo) return false;

  try {
    const marker = new URL(returnTo, env.APP_BASE_URL);
    const appBaseUrl = new URL(env.APP_BASE_URL);
    return marker.origin === appBaseUrl.origin && marker.pathname === CALLBACK_MARKER_PATH;
  } catch {
    return false;
  }
}

export function parseSignupIntentCallbackMarker(returnTo?: string): string | null {
  if (!returnTo || !isSignupIntentCallbackMarker(returnTo)) return null;

  try {
    const marker = new URL(returnTo, env.APP_BASE_URL);
    const nonce = marker.searchParams.get("intent");
    return isValidSignupIntentNonce(nonce) ? nonce : null;
  } catch {
    return null;
  }
}

export function signupIntentCookieOptions(expiresInSeconds: number) {
  return {
    httpOnly: true,
    secure: new URL(env.APP_BASE_URL).protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    // Leave a one-second margin so transport never outlives Redis authority.
    maxAge: Math.max(1, Math.min(SIGNUP_INTENT_TTL_SECONDS, expiresInSeconds - 1)),
  };
}

export async function createPendingSignupIntent(): Promise<string> {
  for (let attempt = 0; attempt < MAX_NONCE_COLLISION_RETRIES; attempt += 1) {
    const nonce = randomNonce();
    const created = await redis.set(await signupIntentKey(nonce), PENDING_VALUE, {
      nx: true,
      ex: SIGNUP_INTENT_TTL_SECONDS,
    });

    if (created === "OK") {
      return nonce;
    }
  }

  throw new Error("Unable to allocate a unique signup intent");
}

export async function bindSignupIntentToSubject(
  nonce: string,
  auth0Sub: string
): Promise<SignupIntentBindingResult> {
  if (!isValidSignupIntentNonce(nonce) || !auth0Sub) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const expectedBoundValue = await boundValue(auth0Sub);
    const result = await redis.eval<string[], number>(
      BIND_INTENT_SCRIPT,
      [await signupIntentKey(nonce)],
      [PENDING_VALUE, expectedBoundValue]
    );

    return result > 1
      ? { ok: true, expiresInSeconds: result }
      : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function validateBoundSignupIntent(
  nonce: string,
  auth0Sub: string
): Promise<SignupIntentResult> {
  if (!isValidSignupIntentNonce(nonce) || !auth0Sub) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const current = await redis.get<string>(await signupIntentKey(nonce));
    return current === (await boundValue(auth0Sub))
      ? { ok: true }
      : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function consumeBoundSignupIntent(
  nonce: string,
  auth0Sub: string
): Promise<SignupIntentResult> {
  if (!isValidSignupIntentNonce(nonce) || !auth0Sub) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const expectedBoundValue = await boundValue(auth0Sub);
    const result = await redis.eval<string[], number>(
      CONSUME_BOUND_INTENT_SCRIPT,
      [await signupIntentKey(nonce)],
      [expectedBoundValue]
    );

    return result === 1
      ? { ok: true }
      : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function deletePendingSignupIntent(nonce: string): Promise<void> {
  if (!isValidSignupIntentNonce(nonce)) return;

  try {
    await redis.eval<string[], number>(
      DELETE_PENDING_INTENT_SCRIPT,
      [await signupIntentKey(nonce)],
      [PENDING_VALUE]
    );
  } catch {
    // The TTL remains the authoritative cleanup path when callback cleanup is unavailable.
  }
}
