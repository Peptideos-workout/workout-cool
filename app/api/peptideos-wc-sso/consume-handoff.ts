import { hashHandoffToken } from "./hash-handoff-token";

import type { PrismaClient } from "@prisma/client";

export interface HandoffClaimRow {
  user_id: string;
  consumed_at: Date | string;
}

export function claimedAtFromRow(row: HandoffClaimRow): Date {
  return row.consumed_at instanceof Date ? row.consumed_at : new Date(row.consumed_at);
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

export async function releaseHandoffClaimByHash(
  db: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> },
  tokenHash: string,
  claimedAt: Date,
): Promise<void> {
  await db.$executeRaw`
      UPDATE public.workout_cool_handoffs
      SET consumed_at = NULL
      WHERE secret_token = ${tokenHash}
        AND consumed_at = ${claimedAt}
        AND expires_at > NOW()
    `;
}

export async function consumeWorkoutCoolHandoff(
  rawToken: string,
  lookupByHash: (tokenHash: string) => Promise<HandoffClaimRow[]>,
): Promise<string | null> {
  const tokenHash = hashHandoffToken(rawToken);
  const rows = await lookupByHash(tokenHash);
  return rows[0]?.user_id ?? null;
}

export type HandoffClaimOutcome<T> =
  | { outcome: "invalid_or_expired_handoff" }
  | { outcome: "success"; value: T }
  | { outcome: "failure"; value: T }
  | { outcome: "error"; error: unknown };

export type HandoffDisposition = "keep" | "release";

/**
 * Atomically claim a single-use handoff. Release only with compare-and-set on the claimed timestamp,
 * and only when the handler says no user/link/session write happened. 409s burn the token.
 */
export async function runWithHandoffClaim<T>(
  rawToken: string,
  deps: {
    claimByHash: (tokenHash: string) => Promise<HandoffClaimRow[]>;
    releaseByHash: (tokenHash: string, claimedAt: Date) => Promise<void>;
  },
  run: (userId: string) => Promise<{ value: T; disposition: HandoffDisposition }>,
): Promise<HandoffClaimOutcome<T>> {
  const tokenHash = hashHandoffToken(rawToken);
  const rows = await deps.claimByHash(tokenHash);
  const row = rows[0];
  if (!row?.user_id) return { outcome: "invalid_or_expired_handoff" };

  const claimedAt = claimedAtFromRow(row);

  try {
    const { value, disposition } = await run(row.user_id);
    if (disposition === "release") {
      await deps.releaseByHash(tokenHash, claimedAt);
      return { outcome: "failure", value };
    }
    return { outcome: "success", value };
  } catch (error) {
    return { outcome: "error", error };
  }
}
