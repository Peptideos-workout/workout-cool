import { NextRequest, NextResponse } from "next/server";

import { publicSignupDisabledBody } from "@/features/auth/lib/public-signup-guard";
import { resolvePeptideOsSignupUrl } from "@/features/auth/lib/peptideos-signup-url";
import { env } from "@/env";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    publicSignupDisabledBody(resolvePeptideOsSignupUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL)),
    { status: 403, headers: { "Cache-Control": "private, no-store" } }
  );
}
