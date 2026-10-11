import { NextResponse } from "next/server";

import { peptideOsSignoutFinalizeLocation } from "@/features/auth/lib/peptideos-signup-url";

export interface PeptideOsWcSignoutDeps {
  signOut: (args: { headers: Headers }) => Promise<unknown>;
  peptideOsOrigin: string;
}

/** Hop C: end the WC session, then 303 to a sanitized PeptideOS URL. Never hop B. */
export async function runPeptideOsWcSignout(
  request: { url: string; headers: Headers },
  deps: PeptideOsWcSignoutDeps
): Promise<NextResponse> {
  try {
    await deps.signOut({ headers: request.headers });
  } catch {
    // Session may already be gone; still leave WC for PeptideOS home.
  }

  const redirectParam = new URL(request.url).searchParams.get("redirect") ?? undefined;
  const location = peptideOsSignoutFinalizeLocation(deps.peptideOsOrigin, redirectParam);
  const response = NextResponse.redirect(location, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
