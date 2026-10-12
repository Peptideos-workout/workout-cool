import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Short-lived hop B cookie that authorizes auto-submit on `/auth/signout/continue`. */
export const SIGNOUT_CONTINUE_COOKIE = "wc_signout_continue";

export const SIGNOUT_CONTINUE_TTL_SECONDS = 60;

export interface SignoutContinueCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  maxAge: number;
  path: "/";
}

/** Used nonces. Best-effort single-use in this process; the cookie is also cleared on continue. */
const usedNonces = new Map<string, number>();

function continueSecret(explicit?: string): string {
  return explicit || process.env.BETTER_AUTH_SECRET || "";
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function sweepUsedNonces(now: number) {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) {
      usedNonces.delete(nonce);
    }
  }
}

/** Mint a signed, ~60s token. `now` / `secret` are injectable for tests. */
export function issueSignoutContinueToken(now = Date.now(), secret = continueSecret()): string {
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required to issue a sign-out continue token");
  }

  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = now + SIGNOUT_CONTINUE_TTL_SECONDS * 1000;
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

/**
 * Consume a continue token. Missing, expired, forged, and replayed values all fail.
 * First consume records the nonce so a replay cannot auto-submit again.
 */
export function consumeSignoutContinueToken(rawCookie: string | undefined, now = Date.now(), secret = continueSecret()): boolean {
  if (!rawCookie || !secret) {
    return false;
  }

  const signatureStart = rawCookie.lastIndexOf(".");
  if (signatureStart < 1) {
    return false;
  }

  const payload = rawCookie.slice(0, signatureStart);
  const signature = rawCookie.slice(signatureStart + 1);
  const expected = signPayload(payload, secret);
  if (!signaturesEqual(signature, expected)) {
    return false;
  }

  const separator = payload.indexOf(".");
  if (separator < 1) {
    return false;
  }

  const expiresAt = Number(payload.slice(0, separator));
  const nonce = payload.slice(separator + 1);
  if (!Number.isFinite(expiresAt) || !nonce) {
    return false;
  }

  sweepUsedNonces(now);

  if (expiresAt <= now) {
    return false;
  }

  if (usedNonces.has(nonce)) {
    return false;
  }

  usedNonces.set(nonce, expiresAt);
  return true;
}

export function signoutContinueView(
  rawCookie: string | undefined,
  now = Date.now(),
  secret = continueSecret()
): "auto-submit" | "confirm" {
  return consumeSignoutContinueToken(rawCookie, now, secret) ? "auto-submit" : "confirm";
}

export function signoutContinueCookieOptions(secure = process.env.NODE_ENV === "production"): SignoutContinueCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    maxAge: SIGNOUT_CONTINUE_TTL_SECONDS,
    path: "/"
  };
}
