import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Short-lived hop B cookie that authorizes auto-submit on `/auth/signout/continue`. */
export const SIGNOUT_CONTINUE_COOKIE = "wc_signout_continue";

/** `__Host-` form used when the cookie is Secure (Path=/, no Domain). */
export const SIGNOUT_CONTINUE_HOST_COOKIE = `__Host-${SIGNOUT_CONTINUE_COOKIE}`;

export const SIGNOUT_CONTINUE_TTL_SECONDS = 60;

/** Internal request header set by the proxy after it verifies the cookie. Never trust a client copy. */
export const SIGNOUT_CONTINUE_OK_HEADER = "x-wc-signout-continue";

export interface SignoutContinueCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  maxAge: number;
  path: "/";
}

/**
 * Token is HMAC-signed with an absolute expiry. Single-use is the cookie clear on /continue.
 *
 * A process-local used-nonce Map also rejects same-instance replays of a captured cookie (needed
 * for `next start` e2e). That Map is not shared across serverless instances — a captured cookie
 * can still verify on another instance until it expires.
 */
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

export function signoutContinueCookieName(secure = process.env.NODE_ENV === "production"): string {
  return secure ? SIGNOUT_CONTINUE_HOST_COOKIE : SIGNOUT_CONTINUE_COOKIE;
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

export function readSignoutContinueCookie(cookies: { get: (name: string) => { value: string } | undefined }): string | undefined {
  return cookies.get(SIGNOUT_CONTINUE_HOST_COOKIE)?.value || cookies.get(SIGNOUT_CONTINUE_COOKIE)?.value;
}

const DECISION_TTL_MS = 10_000;

/** Signed hop-B decision so a rewrite re-entry can reuse consume without trusting a client `1`. */
export function signSignoutContinueDecision(autoSubmit: boolean, now = Date.now(), secret = continueSecret()): string | null {
  if (!secret) {
    return null;
  }
  const payload = `${autoSubmit ? "1" : "0"}.${now}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

export function readSignoutContinueDecision(
  header: string | null | undefined,
  now = Date.now(),
  secret = continueSecret()
): boolean | null {
  if (!header || !secret) {
    return null;
  }

  const signatureStart = header.lastIndexOf(".");
  if (signatureStart < 1) {
    return null;
  }

  const payload = header.slice(0, signatureStart);
  const signature = header.slice(signatureStart + 1);
  if (!signaturesEqual(signature, signPayload(payload, secret))) {
    return null;
  }

  const separator = payload.indexOf(".");
  if (separator !== 1) {
    return null;
  }

  const bit = payload.slice(0, separator);
  const issuedAt = Number(payload.slice(separator + 1));
  if ((bit !== "0" && bit !== "1") || !Number.isFinite(issuedAt) || issuedAt > now || now - issuedAt > DECISION_TTL_MS) {
    return null;
  }

  return bit === "1";
}

export function isSignoutContinueAutoSubmitHeader(headers: { get: (name: string) => string | null }): boolean {
  return readSignoutContinueDecision(headers.get(SIGNOUT_CONTINUE_OK_HEADER)) === true;
}

/** Mint a signed, ~60s token. Missing secret returns null so hop B can fall back to the click page. */
export function issueSignoutContinueToken(now = Date.now(), secret = continueSecret()): string | null {
  if (!secret) {
    return null;
  }

  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = now + SIGNOUT_CONTINUE_TTL_SECONDS * 1000;
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

/**
 * Verify signature + expiry, then mark the nonce used in this process.
 * Missing, expired, forged, and same-instance replayed values all fail.
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
