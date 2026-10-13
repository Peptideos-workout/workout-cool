import crypto from "crypto";

/**
 * PeptideOS PR #22 stores `public.workout_cool_handoffs.secret_token` as
 * `sha256(rawToken)` hex (64 lowercase chars). The raw token is only in the
 * POST form body and must never be persisted or compared.
 */
export function hashHandoffToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
