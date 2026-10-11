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

export async function consumeWorkoutCoolHandoff(
  rawToken: string,
  lookupByHash: (tokenHash: string) => Promise<HandoffLookupRow[]>,
): Promise<string | null> {
  const tokenHash = hashHandoffToken(rawToken);
  const rows = await lookupByHash(tokenHash);
  return rows[0]?.user_id ?? null;
}
