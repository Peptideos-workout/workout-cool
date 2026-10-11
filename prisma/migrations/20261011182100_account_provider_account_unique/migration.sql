-- Unique (providerId, accountId) so a PeptideOS hid cannot be linked to two workout-cool users.
-- Apply with the manual wc migrate path (DIRECT_DATABASE_URL :5432). Vercel does not run migrations.
--
-- Pre-check (read-only) for rows that would block this constraint:
--   SELECT "providerId", "accountId", COUNT(*) AS n, array_agg(id ORDER BY "createdAt", id) AS ids
--   FROM wc.account
--   GROUP BY "providerId", "accountId"
--   HAVING COUNT(*) > 1;
--
-- If that returns rows: keep the oldest account per pair and delete extras, then retry:
--   DELETE FROM wc.account a
--   WHERE a.id IN (
--     SELECT id FROM (
--       SELECT id, ROW_NUMBER() OVER (PARTITION BY "providerId", "accountId" ORDER BY "createdAt" ASC, id ASC) AS rn
--       FROM wc.account
--     ) d
--     WHERE d.rn > 1
--   );
-- Do not apply this unique index until the pre-check is empty.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM wc.account
    GROUP BY "providerId", "accountId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate wc.account (providerId, accountId) rows block unique index. Keep the oldest row per pair, delete extras, then retry.';
  END IF;
END $$;

CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "wc"."account"("providerId", "accountId");
