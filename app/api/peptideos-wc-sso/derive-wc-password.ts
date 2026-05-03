/**
 * COPY beside route.ts → app/api/peptideos-wc-sso/derive-wc-password.ts
 * Must match peptideos/lib/workouts-supabase-sso.ts verbatim.
 */
import crypto from "crypto";

export function deriveWorkoutCoolCredentialFromSupabaseJwtSecret(opts: {
  supabaseJwtSecret: string;
  email: string;
  supabaseUserId: string;
}): string {
  const email = opts.email.trim().toLowerCase();
  return crypto
    .createHmac("sha256", opts.supabaseJwtSecret.trim())
    .update(`wc-better-auth-sso-peptideos-v2\0${email}\0${opts.supabaseUserId}`, "utf8")
    .digest("hex");
}
