/**
 * PeptideOS → Workout.cool sign-out clearer (hop C).
 *
 * PeptideOS PR #37 reaches this with an auto-submit POST form:
 *   POST /api/peptideos-wc-signout?redirect=https://peptideos.us/
 *   Origin: https://peptideos.us
 *
 * GET must not log out (logout CSRF). POST is Origin-checked
 * (Referer fallback). Routed outside `/api/auth/`.
 * Must end the WC session and land on PeptideOS `/`. Must not call hop B.
 */
import { NextResponse } from "next/server";

import { runPeptideOsWcSignout } from "./run-wc-signout";

import type { NextRequest } from "next/server";

import { peptideOsOrigin } from "@/features/auth/lib/peptideos-signup-url";
import { auth } from "@/features/auth/lib/better-auth";
import { env } from "@/env";

export const dynamic = "force-dynamic";

function methodNotAllowed(): NextResponse {
  const response = new NextResponse(null, { status: 405 });
  response.headers.set("Allow", "POST");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET() {
  return methodNotAllowed();
}

export async function POST(request: NextRequest) {
  return runPeptideOsWcSignout(request, {
    signOut: (args) => auth.api.signOut(args),
    peptideOsOrigin: peptideOsOrigin(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL)
  });
}
