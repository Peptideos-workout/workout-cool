import { hashHandoffToken } from "./hash-handoff-token";

import type { PrismaClient } from "@prisma/client";

export interface HandoffLookupRow {
  user_id: string;
}

export async function lookupUnconsumedHandoffByHash(
  db: Pick<PrismaClient, "$queryRaw">,
  tokenHash: string,
): Promise<HandoffLookupRow[]> {
  return db.$queryRaw<HandoffLookupRow[]>`
      UPDATE public.workout_cool_handoffs
      SET consumed_at = NOW()
      WHERE secret_token = ${tokenHash}
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id
    `;
}

export async function releaseHandoffClaimByHash(
  db: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> },
  tokenHash: string,
): Promise<void> {
  await db.$executeRaw`
      UPDATE public.workout_cool_handoffs
      SET consumed_at = NULL
      WHERE secret_token = ${tokenHash}
        AND consumed_at IS NOT NULL
        AND expires_at > NOW()
    `;
}

export async function consumeWorkoutCoolHandoff(
  rawToken: string,
  lookupByHash: (tokenHash: string) => Promise<HandoffLookupRow[]>,
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

/**
 * Atomically claim a single-use handoff, run sign-in, and roll the claim back unless sign-in succeeds.
 */
export async function runWithHandoffClaim<T>(
  rawToken: string,
  deps: {
    claimByHash: (tokenHash: string) => Promise<HandoffLookupRow[]>;
    releaseByHash: (tokenHash: string) => Promise<void>;
  },
  run: (userId: string) => Promise<T>,
  isSuccess: (value: T) => boolean,
): Promise<HandoffClaimOutcome<T>> {
  const tokenHash = hashHandoffToken(rawToken);
  const rows = await deps.claimByHash(tokenHash);
  const userId = rows[0]?.user_id;
  if (!userId) return { outcome: "invalid_or_expired_handoff" };

  try {
    const value = await run(userId);
    if (isSuccess(value)) {
      return { outcome: "success", value };
    }
    await deps.releaseByHash(tokenHash);
    return { outcome: "failure", value };
  } catch (error) {
    await deps.releaseByHash(tokenHash);
    return { outcome: "error", error };
  }
}
