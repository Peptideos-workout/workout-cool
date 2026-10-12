import { hashHandoffToken } from "./hash-handoff-token";

import type { PrismaClient } from "@prisma/client";

export interface HandoffClaimRow {
  user_id: string;
  consumed_at: Date | string;
}

export async function lookupUnconsumedHandoffByHash(
  db: Pick<PrismaClient, "$queryRaw">,
  tokenHash: string,
): Promise<HandoffClaimRow[]> {
  return db.$queryRaw<HandoffClaimRow[]>`
      UPDATE public.workout_cool_handoffs
      SET consumed_at = NOW()
      WHERE secret_token = ${tokenHash}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id, consumed_at
    `;
}

export type HandoffClaimOutcome<T> =
  | { outcome: "invalid_or_expired_handoff" }
  | { outcome: "success"; value: T }
  | { outcome: "error"; error: unknown };

export type HandoffDisposition = "keep";

/**
 * Atomically claim a single-use handoff. A claim stays consumed after success or any failure.
 * Retrying needs a fresh handoff from PeptideOS.
 */
export async function runWithHandoffClaim<T>(
  rawToken: string,
  deps: {
    claimByHash: (tokenHash: string) => Promise<HandoffClaimRow[]>;
  },
  run: (userId: string) => Promise<{ value: T; disposition: HandoffDisposition }>,
): Promise<HandoffClaimOutcome<T>> {
  const tokenHash = hashHandoffToken(rawToken);
  const rows = await deps.claimByHash(tokenHash);
  const row = rows[0];
  if (!row?.user_id) return { outcome: "invalid_or_expired_handoff" };

  try {
    const { value } = await run(row.user_id);
    return { outcome: "success", value };
  } catch (error) {
    return { outcome: "error", error };
  }
}
