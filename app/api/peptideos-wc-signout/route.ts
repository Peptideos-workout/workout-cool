/**
 * PeptideOS → Workout.cool sign-out clearer (hop C).
 *
 * PeptideOS PR #37 POST /auth/signout 303s here:
 *   GET /api/peptideos-wc-signout?redirect=https://peptideos.us/
 *
 * Routed outside `/api/auth/` so Better Auth’s catch-all cannot intercept it.
 * Must end the WC session and land on PeptideOS `/`. Must not call hop B.
 */
import { runPeptideOsWcSignout } from "./run-wc-signout";

import type { NextRequest } from "next/server";

import { peptideOsOrigin } from "@/features/auth/lib/peptideos-signup-url";
import { auth } from "@/features/auth/lib/better-auth";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return runPeptideOsWcSignout(request, {
    signOut: (args) => auth.api.signOut(args),
    peptideOsOrigin: peptideOsOrigin(env.NEXT_PUBLIC_PEPTIDEOS_URL, env.NEXT_PUBLIC_APP_URL)
  });
}
