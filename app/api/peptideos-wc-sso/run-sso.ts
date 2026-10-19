import { NextResponse } from "next/server";

import { applySsoResponseHeaders, ssoClientError } from "./sso-response";
import { logSsoEvent } from "./sso-error-log";
import { handoffDisposition } from "./handoff-disposition";
import { runWithHandoffClaim } from "./consume-handoff";
import { completePeptideOsSsoLogin } from "./complete-sso";

import type { NextRequest } from "next/server";
import type { SsoAccountSnapshot } from "./resolve-sso-account";
import type { CreatePeptideosAccountResult } from "./create-peptideos-account";
import type { HandoffClaimRow } from "./consume-handoff";
import type { AttachTrustedSessionResult } from "./attach-trusted-session";

import { isEmbedSsoSignal } from "@/features/embed/lib/embed-mode";
import { resolvePeptideOsWorkoutsSsoUrl, ssoFinalizeLocation } from "@/features/auth/lib/peptideos-signup-url";
import { logForbiddenOrigin } from "@/features/auth/lib/forbidden-origin-category";

export interface PeptideOsSsoDeps {
  claimByHash: (tokenHash: string) => Promise<HandoffClaimRow[]>;
  lookupAuthUser: (peptideosUserId: string) => Promise<{ email: string; meta: unknown } | null>;
  loadSsoAccountSnapshot: (email: string) => Promise<SsoAccountSnapshot>;
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  signUp: (input: {
    email: string;
    displayName?: string;
    firstName: string;
    lastName: string;
    name: string;
    headers: Headers;
  }) => Promise<{ userId: string } | null>;
  createPeptideosAccount: (userId: string, peptideosUserId: string) => Promise<void | CreatePeptideosAccountResult>;
  findPeptideosAccountByUserId: (userId: string) => Promise<{ accountId: string } | null>;
  createSignedSession: (userId: string) => Promise<AttachTrustedSessionResult>;
  workoutOrigin: string;
}

function mergeSetCookies(from: Response, to: NextResponse) {
  const h = from.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === "function" ? h.getSetCookie() : null;
  if (list && list.length) {
    list.forEach((c) => to.headers.append("set-cookie", c));
    return;
  }
  const one = from.headers.get("set-cookie");
  if (one) to.headers.append("set-cookie", one);
}

function splitName(displayName: string | undefined, email: string): { firstName: string; lastName: string; name: string } {
  const d = displayName?.trim();
  if (d) {
    const p = d.split(/\s+/).filter(Boolean);
    const firstName = p[0] ?? "Athlete";
    const lastName = p.slice(1).join(" ") || "Athlete";
    return { firstName, lastName, name: d };
  }
  const local = (email.split("@")[0] || "Athlete").slice(0, 48);
  return { firstName: local || "Athlete", lastName: "User", name: `${local} User` };
}

function finalizeSession(
  origin: string,
  signInRes: Response,
  redirectParam: string | undefined,
  returnTo: string | undefined,
  status: 303
): NextResponse {
  const redirect = NextResponse.redirect(ssoFinalizeLocation(origin, redirectParam, returnTo), status);
  mergeSetCookies(signInRes, redirect);
  return applySsoResponseHeaders(redirect);
}

function metaDisplayName(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;
  const full =
    typeof m.full_name === "string" ? m.full_name.trim() : typeof m.name === "string" ? m.name.trim() : "";
  return full || undefined;
}

const URLENCODED_FORM = "application/x-www-form-urlencoded";

/** Form POST bodies larger than this are rejected before they are parsed. */
export const SSO_POST_MAX_BYTES = 4 * 1024;

/** Forbidden-origin embed peek. Larger or non-form bodies stay non-embed and are not read. */
export const EMBED_REJECT_PEEK_MAX_BYTES = 8 * 1024;

type DeclaredSsoBody = "absent" | "empty" | "oversized" | "within-cap";

/**
 * A missing Content-Length is measured from the stream.
 * `0`, a non-numeric value, and an empty header are an empty body and are not read.
 * A length over the cap is oversized and is not read.
 */
function declaredSsoPostBody(contentLength: string | null): DeclaredSsoBody {
  if (contentLength === null) return "absent";
  const trimmed = contentLength.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return "empty";
  const declared = Number(trimmed);
  if (!Number.isSafeInteger(declared)) return "oversized";
  if (declared === 0) return "empty";
  if (declared > SSO_POST_MAX_BYTES) return "oversized";
  return "within-cap";
}

/**
 * Counts bytes and cancels the stream once the total passes the cap.
 * A declared length over the cap never reaches this, so that body is not read.
 */
async function readCappedSsoPostBody(request: NextRequest): Promise<Uint8Array | "empty" | "oversized"> {
  if (!request.body) return "empty";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let oversized = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (total + value.byteLength > SSO_POST_MAX_BYTES) {
        oversized = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  if (oversized) return "oversized";
  if (total === 0) return "empty";

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Origin must equal the configured PeptideOS origin. Missing, www, and any other value are rejected. */
export function isExactPeptideOsSsoOrigin(originHeader: string | null, expectedOrigin: string): boolean {
  if (!originHeader || !expectedOrigin) return false;
  return originHeader === expectedOrigin;
}

function isUrlEncodedForm(request: NextRequest): boolean {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return mediaType === URLENCODED_FORM;
}

function fieldsFromUrlEncoded(bytes: Uint8Array): { token?: string; redirect?: string; returnTo?: string; embed?: string } {
  const params = new URLSearchParams(new TextDecoder().decode(bytes));
  const token = params.get("token")?.trim() ?? "";
  const redirect = params.get("redirect");
  const returnTo = params.get("return");
  const embed = params.get("embed");
  return {
    token: token || undefined,
    redirect: redirect === null ? undefined : redirect,
    returnTo: returnTo === null ? undefined : returnTo,
    embed: embed === null ? undefined : embed
  };
}

function embedFromRequest(request: NextRequest, embedField?: string | null): boolean {
  return isEmbedSsoSignal({
    search: request.nextUrl.search,
    referer: request.headers.get("referer"),
    embedField
  });
}

async function releaseUnreadBody(request: NextRequest): Promise<void> {
  try {
    await request.body?.cancel();
  } catch {
    /* already closed */
  }
}

async function embedFromRejectedRequest(request: NextRequest): Promise<boolean> {
  if (embedFromRequest(request)) {
    await releaseUnreadBody(request);
    return true;
  }
  if (!isUrlEncodedForm(request)) {
    await releaseUnreadBody(request);
    return false;
  }

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const trimmed = declared.trim();
    if (!/^\d+$/.test(trimmed)) {
      await releaseUnreadBody(request);
      return false;
    }
    const length = Number(trimmed);
    if (!Number.isSafeInteger(length) || length === 0 || length > EMBED_REJECT_PEEK_MAX_BYTES) {
      await releaseUnreadBody(request);
      return false;
    }
  }

  try {
    const text = await readPeekText(request, EMBED_REJECT_PEEK_MAX_BYTES);
    if (text === null) return false;
    return new URLSearchParams(text).get("embed") === "1";
  } catch {
    return false;
  }
}

/** Reads at most `maxBytes`. A body that would pass the cap is dropped and not parsed. */
async function readPeekText(request: NextRequest, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let oversized = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (total + value.byteLength > maxBytes) {
        oversized = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  if (oversized) return null;
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

type SsoPostRead =
  | { outcome: "empty" }
  | { outcome: "oversized" }
  | { outcome: "fields"; token?: string; redirect?: string; returnTo?: string; embed?: string };

/** Size-check the POST, then decode once from the collected bytes as urlencoded. Never calls `formData()`. */
async function readSsoPost(request: NextRequest): Promise<SsoPostRead> {
  const declared = declaredSsoPostBody(request.headers.get("content-length"));
  if (declared === "empty") return { outcome: "empty" };
  if (declared === "oversized") return { outcome: "oversized" };

  const bytes = await readCappedSsoPostBody(request);
  if (bytes === "empty") return { outcome: "empty" };
  if (bytes === "oversized") return { outcome: "oversized" };
  if (!isUrlEncodedForm(request)) return { outcome: "fields" };
  return { outcome: "fields", ...fieldsFromUrlEncoded(bytes) };
}

interface SsoSubmission {
  token?: string;
  redirect?: string;
  returnTo?: string;
  embed?: string;
  status: 303;
}

async function executePeptideOsSso(request: NextRequest, deps: PeptideOsSsoDeps, submission: SsoSubmission): Promise<NextResponse> {
  const redirectParam = submission.redirect;
  const returnTo = submission.returnTo;
  const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin, redirectParam);
  const embed = embedFromRequest(request, submission.embed);
  const reply = (body: Record<string, unknown>, status: number) => ssoClientError(request, body, status, tryAgainHref, embed);
  const tokenParam = submission.token?.trim();
  if (!tokenParam) return reply({ error: "missing_token" }, 400);

  try {
    const claimed = await runWithHandoffClaim(
      tokenParam,
      {
        claimByHash: deps.claimByHash
      },
      async (hid) => {
        let authUser: { email: string; meta: unknown } | null;
        try {
          authUser = await deps.lookupAuthUser(hid);
        } catch (e) {
          logSsoEvent("auth_users_lookup", e);
          return {
            value: reply({ error: "auth_users_lookup_failed" }, 500),
            disposition: "keep" as const
          };
        }

        const email = authUser?.email?.trim().toLowerCase();
        if (!authUser || !email) {
          return { value: reply({ error: "missing_email" }, 500), disposition: "keep" as const };
        }

        const displayName = metaDisplayName(authUser.meta);
        const snapshot = await deps.loadSsoAccountSnapshot(email);
        let sessionResponse: Response | null = null;

        const completed = await completePeptideOsSsoLogin(hid, snapshot, {
          findUserByEmail: () => deps.findUserByEmail(email),
          signUp: async () => {
            const { firstName, lastName, name } = splitName(displayName, email);
            return deps.signUp({ email, displayName, firstName, lastName, name, headers: request.headers });
          },
          createPeptideosAccount: async (userId) => deps.createPeptideosAccount(userId, hid),
          findPeptideosAccountByUserId: (userId) => deps.findPeptideosAccountByUserId(userId),
          createSignedSession: async (userId) => {
            const result = await deps.createSignedSession(userId);
            if (result.ok) sessionResponse = result.response;
            return result;
          }
        });

        if (!completed.ok) {
          return {
            value: reply({ error: completed.error }, completed.status),
            disposition: handoffDisposition()
          };
        }
        if (!sessionResponse) {
          return {
            value: reply({ error: "sso_signin_failed" }, 500),
            disposition: handoffDisposition()
          };
        }
        return {
          value: finalizeSession(deps.workoutOrigin, sessionResponse, redirectParam, returnTo, submission.status),
          disposition: "keep" as const
        };
      },
    );

    if (claimed.outcome === "invalid_or_expired_handoff") {
      return reply({ error: "invalid_or_expired_handoff" }, 400);
    }
    if (claimed.outcome === "error") {
      logSsoEvent("claimed_run", claimed.error);
      return reply({ error: "sso_internal_error" }, 500);
    }
    return claimed.value;
  } catch (e) {
    logSsoEvent("unhandled", e);
    return reply({ error: "sso_internal_error" }, 500);
  }
}

function ssoEmptyBody(request: NextRequest, workoutOrigin: string): NextResponse {
  logSsoEvent("sso_body", undefined, "empty_body");
  const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, workoutOrigin);
  return ssoClientError(request, { error: "empty_body" }, 400, tryAgainHref, embedFromRequest(request));
}

function ssoPayloadTooLarge(request: NextRequest, workoutOrigin: string): NextResponse {
  logSsoEvent("sso_body", undefined, "payload_too_large");
  const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, workoutOrigin);
  return ssoClientError(request, { error: "payload_too_large" }, 413, tryAgainHref, embedFromRequest(request));
}

/**
 * Non-POST methods are not a handoff. Arguments are ignored, so a `?token=` query value
 * is never read, validated, logged, or consumed.
 */
export function ssoMethodNotAllowed(..._ignored: unknown[]): NextResponse {
  const response = NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  response.headers.set("Allow", "POST");
  return applySsoResponseHeaders(response);
}

/** HEAD matches the other rejections, with an empty body. */
export function ssoHeadNotAllowed(..._ignored: unknown[]): NextResponse {
  const response = new NextResponse(null, { status: 405 });
  response.headers.set("Allow", "POST");
  return applySsoResponseHeaders(response);
}

/**
 * Form POST from PeptideOS. Origin is checked before the handoff is read or consumed.
 * Optional hidden field `return` is taken from this body only, never from the query string.
 * Success is 303 so Back GETs the landing URL instead of resubmitting the handoff.
 */
export async function runPeptideOsSsoPost(
  request: NextRequest,
  deps: PeptideOsSsoDeps,
  expectedOrigin: string
): Promise<NextResponse> {
  if (!isExactPeptideOsSsoOrigin(request.headers.get("origin"), expectedOrigin)) {
    logSsoEvent("sso_origin", undefined, "forbidden_origin");
    logForbiddenOrigin(request.headers, request.method);
    const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin);
    const embed = await embedFromRejectedRequest(request);
    return ssoClientError(request, { error: "forbidden_origin" }, 403, tryAgainHref, embed);
  }

  if (!isUrlEncodedForm(request)) {
    const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin);
    return ssoClientError(request, { error: "unsupported_media_type" }, 415, tryAgainHref, embedFromRequest(request));
  }

  let read: SsoPostRead;
  try {
    read = await readSsoPost(request);
  } catch (e) {
    logSsoEvent("sso_body", e);
    const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin);
    return ssoClientError(request, { error: "sso_internal_error" }, 500, tryAgainHref, embedFromRequest(request));
  }
  if (read.outcome === "empty") return ssoEmptyBody(request, deps.workoutOrigin);
  if (read.outcome === "oversized") return ssoPayloadTooLarge(request, deps.workoutOrigin);

  return executePeptideOsSso(request, deps, {
    token: read.token,
    redirect: read.redirect,
    returnTo: read.returnTo,
    embed: read.outcome === "fields" ? read.embed : undefined,
    status: 303
  });
}
