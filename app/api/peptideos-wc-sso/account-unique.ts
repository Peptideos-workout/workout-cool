/** Read-only SQL to find wc.account rows that would block @@unique([providerId, accountId]). */
export const ACCOUNT_PROVIDER_ACCOUNT_DUPLICATE_SQL = `
SELECT "providerId", "accountId", COUNT(*) AS n, array_agg(id ORDER BY "createdAt", id) AS ids
FROM wc.account
GROUP BY "providerId", "accountId"
HAVING COUNT(*) > 1
`.trim();

/** Keep the oldest row per (providerId, accountId) and delete extras. Run only after reviewing the pre-check. */
export const ACCOUNT_PROVIDER_ACCOUNT_DEDUPE_SQL = `
DELETE FROM wc.account a
WHERE a.id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY "providerId", "accountId" ORDER BY "createdAt" ASC, id ASC) AS rn
    FROM wc.account
  ) d
  WHERE d.rn > 1
)
`.trim();
