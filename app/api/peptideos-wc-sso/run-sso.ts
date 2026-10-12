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

type SsoPostBodyLimit = "ok" | "missing" | "oversized";

/** `Content-Length` over the cap, or an unusable length. Absent means the body itself must be measured. */
function declaredSsoPostBodyLimit(contentLength: string | null): SsoPostBodyLimit | "absent" {
  if (contentLength === null) return "absent";
  const trimmed = contentLength.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return "missing";
  const declared = Number(trimmed);
  if (!Number.isSafeInteger(declared) || declared === 0) return "missing";
  if (declared > SSO_POST_MAX_BYTES) return "oversized";
  return "ok";
}

/**
 * Byte length of a body whose declared length is missing or within the cap.
 * A `Content-Length` over the cap is rejected before this runs, so `formData()` is never called on it.
 * Returns 0 when the request has no body.
 */
async function measuredSsoPostBodyLength(request: NextRequest): Promise<number | "oversized"> {
  if (!request.body) return 0;
  const bytes = await request.clone().arrayBuffer();
  if (bytes.byteLength > SSO_POST_MAX_BYTES) return "oversized";
  return bytes.byteLength;
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

async function readSsoForm(request: NextRequest): Promise<{ token?: string; redirect?: string }> {
  if (!isUrlEncodedForm(request)) return {};
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {};
  }
  const tokenValue = form.get("token");
  const redirectValue = form.get("redirect");
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  return {
    token: token || undefined,
    redirect: typeof redirectValue === "string" ? redirectValue : undefined
  };
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

function ssoPayloadTooLarge(request: NextRequest, workoutOrigin: string): NextResponse {
  logSsoEvent("sso_body", undefined, "payload_too_large");
  const tryAgainHref = resolvePeptideOsWorkoutsSsoUrl(undefined, workoutOrigin);
  return ssoClientError(request, { error: "payload_too_large" }, 413, tryAgainHref);
}

/** 413 before `formData()`. A declared length over the cap is rejected without reading the body. */
async function rejectOversizedSsoPost(request: NextRequest, workoutOrigin: string): Promise<NextResponse | null> {
  const declared = declaredSsoPostBodyLimit(request.headers.get("content-length"));
  if (declared === "missing" || declared === "oversized") {
    return ssoPayloadTooLarge(request, workoutOrigin);
  }

  const measured = await measuredSsoPostBodyLength(request);
  if (measured === "oversized" || measured === 0) {
    return ssoPayloadTooLarge(request, workoutOrigin);
  }
  return null;
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

  const tooLarge = await rejectOversizedSsoPost(request, deps.workoutOrigin);
  if (tooLarge) return tooLarge;

  const form = await readSsoForm(request);
  return executePeptideOsSso(request, deps, {
    token: form.token,
    redirect: form.redirect,
    status: 303
  });
}
