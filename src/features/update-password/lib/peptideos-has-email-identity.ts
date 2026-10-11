import { prisma } from "@/shared/lib/prisma";

const AUTH_USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAuthUserId(value: string): boolean {
  return AUTH_USER_ID_RE.test(value);
}

/**
 * Fail-closed read of `wc.peptideos_has_email_identity`.
 * Returns `null` when the id is invalid, the result is not a boolean, or the SQL helper is missing.
 */
export async function peptideosHasEmailIdentity(
  peptideosUserId: string | null | undefined,
  query: (userId: string) => Promise<unknown>
): Promise<boolean | null> {
  if (!peptideosUserId || !isAuthUserId(peptideosUserId)) {
    return null;
  }

  try {
    const result = await query(peptideosUserId);
    return typeof result === "boolean" ? result : null;
  } catch {
    return null;
  }
}

export async function queryPeptideosHasEmailIdentity(userId: string): Promise<boolean | null> {
  const rows = await prisma.$queryRaw<Array<{ has_email_identity: boolean | null }>>`
    SELECT wc.peptideos_has_email_identity(${userId}::uuid) AS has_email_identity
  `;
  const value = rows[0]?.has_email_identity;
  return typeof value === "boolean" ? value : null;
}
