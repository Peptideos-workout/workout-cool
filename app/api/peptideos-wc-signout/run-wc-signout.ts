import { NextResponse } from "next/server";

import { logSsoEvent } from "../peptideos-wc-sso/sso-error-log";

import { peptideOsSignoutFinalizeLocation } from "@/features/auth/lib/peptideos-signup-url";

export interface PeptideOsWcSignoutDeps {
  signOut: (args: { headers: Headers }) => Promise<unknown>;
  peptideOsOrigin: string;
}

/** Exact PeptideOS browser origins allowed to POST hop C. No wildcards. */
export const TRUSTED_HOP_C_ORIGINS = ["https://peptideos.us", "https://www.peptideos.us"] as const;

const TRUSTED_HOP_C_ORIGIN_SET = new Set<string>(TRUSTED_HOP_C_ORIGINS);

function headerOrigin(value: string | null): string | undefined {
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

/** Origin must be exactly peptideos.us or www.peptideos.us. Referer origin is used only when Origin is absent. */
export function isTrustedPeptideOsHopCRequest(headers: { get: (name: string) => string | null }): boolean {
  const origin = headerOrigin(headers.get("origin"));
  if (origin) {
    return TRUSTED_HOP_C_ORIGIN_SET.has(origin);
  }

  const referer = headerOrigin(headers.get("referer"));
  return referer !== undefined && TRUSTED_HOP_C_ORIGIN_SET.has(referer);
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
  if (!isTrustedPeptideOsHopCRequest(request.headers)) {
    return forbidden();
  }

  let signOutResponse: Response | null = null;
  try {
    const result = await deps.signOut({ headers: request.headers });
    if (result instanceof Response) {
      signOutResponse = result;
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
