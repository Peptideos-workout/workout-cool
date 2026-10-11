import { NextResponse } from "next/server";

import { peptideOsSignoutFinalizeLocation } from "@/features/auth/lib/peptideos-signup-url";

export interface PeptideOsWcSignoutDeps {
  signOut: (args: { headers: Headers }) => Promise<unknown>;
  peptideOsOrigin: string;
}

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

/** Origin must be the PeptideOS origin. Referer origin is used only when Origin is absent. */
export function isTrustedPeptideOsHopCRequest(
  headers: { get: (name: string) => string | null },
  allowedOrigin: string
): boolean {
  let allowed: string;
  try {
    allowed = new URL(allowedOrigin).origin;
  } catch {
    return false;
  }

  const origin = headerOrigin(headers.get("origin"));
  if (origin) {
    return origin === allowed;
  }

  const referer = headerOrigin(headers.get("referer"));
  return referer === allowed;
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

/** Hop C POST: Origin-checked, then end the WC session and 303 to PeptideOS /. Never hop B. */
export async function runPeptideOsWcSignout(
  request: { url: string; headers: Headers; formData?: () => Promise<FormData> },
  deps: PeptideOsWcSignoutDeps
): Promise<NextResponse> {
  if (!isTrustedPeptideOsHopCRequest(request.headers, deps.peptideOsOrigin)) {
    return forbidden();
  }

  try {
    await deps.signOut({ headers: request.headers });
  } catch {
    // Session may already be gone; still leave WC for PeptideOS home.
  }

  const redirectParam = await readRedirectParam(request);
  const location = peptideOsSignoutFinalizeLocation(deps.peptideOsOrigin, redirectParam);
  const response = NextResponse.redirect(location, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
