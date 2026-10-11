-- Unique (userId, providerId) so one workout-cool user cannot have two PeptideOS
-- (or two of any provider) account rows.
--
-- This is standalone SQL, not a Prisma migration. PeptideOS PR #35 created
-- wc.account_userId_providerId_key. The Prisma schema maps that name with
-- @@unique([userId, providerId], map: "account_userId_providerId_key").
-- Do not add a Prisma migration that recreates the index.
--
-- Pre-check (read-only) for rows that would block this constraint:
--   SELECT "userId", "providerId", COUNT(*) AS n, array_agg(id ORDER BY "createdAt", id) AS ids
--   FROM wc.account
--   GROUP BY "userId", "providerId"
--   HAVING COUNT(*) > 1;
--
-- If that returns rows: keep the oldest account per pair and delete extras, then retry:
--   DELETE FROM wc.account a
--   WHERE a.id IN (
--     SELECT id FROM (
--       SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId", "providerId" ORDER BY "createdAt" ASC, id ASC) AS rn
--       FROM wc.account
--     ) d
--     WHERE d.rn > 1
--   );
-- Do not apply this unique index until the pre-check is empty.
--
-- Rollback: docs/sql/account-user-provider-unique.rollback.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM wc.account
    GROUP BY "userId", "providerId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate wc.account (userId, providerId) rows block unique index. Keep the oldest row per pair, delete extras, then retry.';
  END IF;
END $$;

CREATE UNIQUE INDEX "account_userId_providerId_key" ON "wc"."account"("userId", "providerId");
