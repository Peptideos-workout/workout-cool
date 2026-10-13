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

import { resolvePeptideOsWorkoutsSsoUrl, ssoFinalizeLocation } from "@/features/auth/lib/peptideos-signup-url";

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

function finalizeSession(origin: string, signInRes: Response, redirectParam: string | undefined, status: 303 | 307): NextResponse {
  const redirect = NextResponse.redirect(ssoFinalizeLocation(origin, redirectParam), status);
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

function fieldsFromUrlEncoded(bytes: Uint8Array): { token?: string; redirect?: string } {
  const params = new URLSearchParams(new TextDecoder().decode(bytes));
  const token = params.get("token")?.trim() ?? "";
  const redirect = params.get("redirect");
  return {
    token: token || undefined,
    redirect: redirect === null ? undefined : redirect
  };
}

type SsoPostRead = { outcome: "empty" } | { outcome: "oversized" } | { outcome: "fields"; token?: string; redirect?: string };

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
  status: 303 | 307;
}

async function executePeptideOsSso(request: NextRequest, deps: PeptideOsSsoDeps, submission: SsoSubmission): Promise<NextResponse> {
  const redirectParam = submission.redirect;
  const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin, redirectParam);
  const reply = (body: Record<string, unknown>, status: number) => ssoClientError(request, body, status, tryAgainHref);
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
          value: finalizeSession(deps.workoutOrigin, sessionResponse, redirectParam, submission.status),
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
  return ssoClientError(request, { error: "empty_body" }, 400, tryAgainHref);
}

function ssoPayloadTooLarge(request: NextRequest, workoutOrigin: string): NextResponse {
  logSsoEvent("sso_body", undefined, "payload_too_large");
  const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, workoutOrigin);
  return ssoClientError(request, { error: "payload_too_large" }, 413, tryAgainHref);
}

/** GET `?token=` rollout path. Redirect stays 307 so a navigation remains a GET. */
export async function runPeptideOsSso(request: NextRequest, deps: PeptideOsSsoDeps): Promise<NextResponse> {
  return executePeptideOsSso(request, deps, {
    token: request.nextUrl.searchParams.get("token")?.trim(),
    redirect: request.nextUrl.searchParams.get("redirect") ?? undefined,
    status: 307
  });
}

/**
 * Form POST from PeptideOS. Origin is checked before the handoff is read or consumed.
 * Success is 303 so the browser GETs the sanitized workout URL instead of re-POSTing it.
 * The consume, account, and session steps are the same as GET.
 */
export async function runPeptideOsSsoPost(
  request: NextRequest,
  deps: PeptideOsSsoDeps,
  expectedOrigin: string
): Promise<NextResponse> {
  if (!isExactPeptideOsSsoOrigin(request.headers.get("origin"), expectedOrigin)) {
    logSsoEvent("sso_origin", undefined, "forbidden_origin");
    const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin);
    return ssoClientError(request, { error: "forbidden_origin" }, 403, tryAgainHref);
  }

  if (!isUrlEncodedForm(request)) {
    const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin);
    return ssoClientError(request, { error: "unsupported_media_type" }, 415, tryAgainHref);
  }

  let read: SsoPostRead;
  try {
    read = await readSsoPost(request);
  } catch (e) {
    logSsoEvent("sso_body", e);
    const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, deps.workoutOrigin);
    return ssoClientError(request, { error: "sso_internal_error" }, 500, tryAgainHref);
  }
  if (read.outcome === "empty") return ssoEmptyBody(request, deps.workoutOrigin);
  if (read.outcome === "oversized") return ssoPayloadTooLarge(request, deps.workoutOrigin);

  return executePeptideOsSso(request, deps, {
    token: read.token,
    redirect: read.redirect,
    status: 303
  });
}
