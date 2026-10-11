import { NextResponse } from "next/server";

import { ssoJson } from "./sso-response";
import { logSsoEvent } from "./sso-error-log";
import { ssoCollisionHandoff } from "./offer-link";
import { handoffDisposition } from "./handoff-disposition";
import { runWithHandoffClaim } from "./consume-handoff";
import { completePeptideOsSsoLogin } from "./complete-sso";

import type { NextRequest } from "next/server";
import type { SsoAccountSnapshot } from "./resolve-sso-account";
import type { HandoffClaimRow } from "./consume-handoff";
import type { AttachTrustedSessionResult } from "./attach-trusted-session";

export interface PeptideOsSsoDeps {
  claimByHash: (tokenHash: string) => Promise<HandoffClaimRow[]>;
  releaseByHash: (tokenHash: string, claimedAt: Date) => Promise<void>;
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
  createPeptideosAccount: (userId: string, peptideosUserId: string) => Promise<void>;
  createSignedSession: (userId: string) => Promise<AttachTrustedSessionResult>;
  workoutOrigin: string;
  betterAuthSecret: string;
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

function finalizeSession(origin: string, signInRes: Response): NextResponse {
  const redirect = NextResponse.redirect(`${origin}/`);
  mergeSetCookies(signInRes, redirect);
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}

function ssoExplain(e: unknown): { dev_detail?: string } {
  const allow =
    process.env.NODE_ENV === "development" || process.env.SSO_DIAGNOSTICS === "1" || process.env.SSO_DIAGNOSTICS === "true";
  if (!allow) return {};
  let msg =
    e instanceof Error
      ? e.message || String(e)
      : typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : String(e);
  const code =
    typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code.trim()
      : "";
  msg = `${code ? `${code} — ` : ""}${msg}`;
  msg = msg.slice(0, 800);
  return msg ? { dev_detail: msg } : {};
}

function metaDisplayName(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;
  const full =
    typeof m.full_name === "string" ? m.full_name.trim() : typeof m.name === "string" ? m.name.trim() : "";
  return full || undefined;
}

export async function runPeptideOsSso(request: NextRequest, deps: PeptideOsSsoDeps): Promise<NextResponse> {
  const tokenParam = request.nextUrl.searchParams.get("token")?.trim();
  if (!tokenParam) return ssoJson({ error: "missing_token" }, 400);

  try {
    const claimed = await runWithHandoffClaim(
      tokenParam,
      {
        claimByHash: deps.claimByHash,
        releaseByHash: deps.releaseByHash
      },
      async (hid) => {
        let authUser: { email: string; meta: unknown } | null;
        try {
          authUser = await deps.lookupAuthUser(hid);
        } catch (e) {
          logSsoEvent("auth_users_lookup", e);
          return {
            value: ssoJson({ error: "auth_users_lookup_failed", ...ssoExplain(e) }, 500),
            disposition: "release" as const
          };
        }

        const email = authUser?.email?.trim().toLowerCase();
        if (!authUser || !email) {
          return { value: ssoJson({ error: "missing_email" }, 500), disposition: "release" as const };
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
          createPeptideosAccount: async (userId) => {
            await deps.createPeptideosAccount(userId, hid);
          },
          createSignedSession: async (userId) => {
            const result = await deps.createSignedSession(userId);
            if (result.ok) sessionResponse = result.response;
            return result;
          }
        });

        if (!completed.ok) {
          if (completed.error === "sso_email_collision") {
            return ssoCollisionHandoff({
              completed,
              peptideosUserId: hid,
              origin: deps.workoutOrigin,
              secret: deps.betterAuthSecret
            });
          }
          return {
            value: ssoJson({ error: completed.error }, completed.status),
            disposition: handoffDisposition(completed.status, completed.wroteUserState)
          };
        }
        if (!sessionResponse) {
          return {
            value: ssoJson({ error: "sso_signin_failed" }, 500),
            disposition: handoffDisposition(500, completed.wroteUserState)
          };
        }
        return { value: finalizeSession(deps.workoutOrigin, sessionResponse), disposition: "keep" as const };
      },
    );

    if (claimed.outcome === "invalid_or_expired_handoff") {
      return ssoJson({ error: "invalid_or_expired_handoff" }, 400);
    }
    if (claimed.outcome === "error") {
      logSsoEvent("claimed_run", claimed.error);
      return ssoJson({ error: "sso_internal_error", ...ssoExplain(claimed.error) }, 500);
    }
    return claimed.value;
  } catch (e) {
    logSsoEvent("unhandled", e);
    return ssoJson({ error: "sso_internal_error", ...ssoExplain(e) }, 500);
  }
}
