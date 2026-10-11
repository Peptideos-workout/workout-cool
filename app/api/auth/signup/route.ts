import { NextRequest, NextResponse } from "next/server";

import { isPublicSignupBlocked, PUBLIC_SIGNUP_DISABLED, publicSignupDisabledBody } from "@/features/auth/lib/public-signup-guard";
import { resolvePeptideOsSignupUrl } from "@/features/auth/lib/peptideos-signup-url";
import { env } from "@/env";

function peptideOsSignupRedirect() {
  return resolvePeptideOsSignupUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL);
}

export async function POST(_req: NextRequest) {
  const body = publicSignupDisabledBody(peptideOsSignupRedirect());
  if (isPublicSignupBlocked()) {
    return NextResponse.json(body, {
      status: 403,
      headers: { "Cache-Control": "private, no-store" }
    });
  }

  return NextResponse.json(
    { error: PUBLIC_SIGNUP_DISABLED, redirectTo: body.redirectTo },
    { status: 403, headers: { "Cache-Control": "private, no-store" } }
  );
}
