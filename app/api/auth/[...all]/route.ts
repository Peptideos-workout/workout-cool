import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import type { NextRequest } from "next/server";

import { passwordResetDisabledBody, publicSignupDisabledBody } from "@/features/auth/lib/public-signup-guard";
import { resolvePeptideOsForgotPasswordUrl, resolvePeptideOsSignupUrl } from "@/features/auth/lib/peptideos-signup-url";
import {
  isBetterAuthPasswordResetRequest,
  isPublicBetterAuthSignupRequest,
  isUndecodableBetterAuthPath
} from "@/features/auth/lib/block-public-signup";
import { auth } from "@/features/auth/lib/better-auth";
import { env } from "@/env";

const handler = toNextJsHandler(auth);

function blockedPublicSignup() {
  return NextResponse.json(
    publicSignupDisabledBody(resolvePeptideOsSignupUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL)),
    { status: 403, headers: { "Cache-Control": "private, no-store" } }
  );
}

function disabledPasswordReset() {
  return NextResponse.json(
    passwordResetDisabledBody(resolvePeptideOsForgotPasswordUrl(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL)),
    { status: 200, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(req: NextRequest) {
  if (isUndecodableBetterAuthPath(req.nextUrl.pathname) || isPublicBetterAuthSignupRequest(req.nextUrl.pathname)) {
    return blockedPublicSignup();
  }
  if (isBetterAuthPasswordResetRequest(req.nextUrl.pathname)) {
    return disabledPasswordReset();
  }
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  if (isUndecodableBetterAuthPath(req.nextUrl.pathname) || isPublicBetterAuthSignupRequest(req.nextUrl.pathname)) {
    return blockedPublicSignup();
  }
  if (isBetterAuthPasswordResetRequest(req.nextUrl.pathname)) {
    return disabledPasswordReset();
  }
  return handler.POST(req);
}
