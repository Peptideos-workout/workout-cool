import { NextResponse } from "next/server";

import { logSsoEvent, SSO_LOG_LEVEL } from "../peptideos-wc-sso/sso-error-log";

import { peptideOsSignoutFinalizeLocation } from "@/features/auth/lib/peptideos-signup-url";

export interface PeptideOsWcSignoutDeps {
  signOut: (args: { headers: Headers }) => Promise<unknown>;
  peptideOsOrigin: string;
  /** `NEXT_PUBLIC_APP_URL` origin. Added to the hop C allowlist only when it is a loopback/dev host. */
  configuredAppOrigin?: string;
}

/** Exact PeptideOS browser origins always allowed to POST hop C. No wildcards. */
export const TRUSTED_HOP_C_ORIGINS = ["https://peptideos.us", "https://www.peptideos.us"] as const;

function headerOrigin(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) {
    return undefined;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

/** Loopback/dev hosts that may be added from env. Production WC / PeptideOS app origins are not. */
export function isLoopbackDevOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/** Exact two production PeptideOS hosts, plus a configured origin only when it is loopback/dev. */
export function hopCOriginAllowlist(...configuredOrigins: Array<string | undefined>): string[] {
  const allowed = new Set<string>(TRUSTED_HOP_C_ORIGINS);
  for (const configured of configuredOrigins) {
    const origin = headerOrigin(configured);
    if (origin && isLoopbackDevOrigin(origin)) {
      allowed.add(origin);
    }
  }
  return [...allowed];
}

/** Origin must be an exact allowlisted host. Referer origin is used only when Origin is absent. */
export function isTrustedPeptideOsHopCRequest(
  headers: { get: (name: string) => string | null },
  ...configuredOrigins: Array<string | undefined>
): boolean {
  const allowed = new Set(hopCOriginAllowlist(...configuredOrigins));
  const origin = headerOrigin(headers.get("origin"));
  if (origin) {
    return allowed.has(origin);
  }

  const referer = headerOrigin(headers.get("referer"));
  return referer !== undefined && allowed.has(referer);
}

async function readRedirectParam(request: { url: string; formData?: () => Promise<FormData> }): Promise<string | undefined> {
  const fromQuery = new URL(request.url).searchParams.get("redirect") ?? undefined;
  if (typeof request.formData !== "function") {
    return fromQuery;
  }
  try {
    const form = await request.formData();
    const fromBody = form.get("redirect");
    if (typeof fromBody === "string" && fromBody.trim()) {
      return fromBody;
    }
  } catch {
    // Query-only POST, or an unreadable body — fall back to the query.
  }
  return fromQuery;
}

function forbidden(): NextResponse {
  const response = new NextResponse(null, { status: 403 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/** Better Auth `/sign-out` returns 400 when no session cookie was sent. That is a normal hop C outcome. */
export function isNoSessionSignOutStatus(status: number): boolean {
  return status === 400;
}

function copySetCookies(from: Response, to: NextResponse) {
  const h = from.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof h.getSetCookie === "function" ? h.getSetCookie() : null;
  if (list && list.length) {
    list.forEach((cookie) => to.headers.append("set-cookie", cookie));
    return;
  }
  const one = from.headers.get("set-cookie");
  if (one) {
    to.headers.append("set-cookie", one);
  }
}

/** Hop C POST: Origin-checked, then end the WC session and 303 to PeptideOS /. Never hop B. */
export async function runPeptideOsWcSignout(
  request: { url: string; headers: Headers; formData?: () => Promise<FormData> },
  deps: PeptideOsWcSignoutDeps
): Promise<NextResponse> {
  if (!isTrustedPeptideOsHopCRequest(request.headers, deps.peptideOsOrigin, deps.configuredAppOrigin)) {
    return forbidden();
  }

  let signOutResponse: Response | null = null;
  try {
    const result = await deps.signOut({ headers: request.headers });
    if (result instanceof Response) {
      signOutResponse = result;
      if (!result.ok) {
        if (isNoSessionSignOutStatus(result.status)) {
          logSsoEvent("wc_signout", { name: "Response", code: String(result.status) }, "signout_no_session", SSO_LOG_LEVEL.info);
        } else {
          logSsoEvent("wc_signout", { name: "Response", code: String(result.status) }, "signout_not_ok");
        }
      }
    }
  } catch (error) {
    logSsoEvent("wc_signout", error);
  }

  const redirectParam = await readRedirectParam(request);
  const location = peptideOsSignoutFinalizeLocation(deps.peptideOsOrigin, redirectParam);
  const response = NextResponse.redirect(location, 303);
  response.headers.set("Cache-Control", "private, no-store");
  if (signOutResponse) {
    copySetCookies(signOutResponse, response);
  }
  return response;
}
