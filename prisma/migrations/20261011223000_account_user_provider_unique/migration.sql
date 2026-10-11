-- Unique (userId, providerId) so one workout-cool user cannot have two PeptideOS
-- (or two of any provider) account rows.
--
-- PeptideOS PR #35 already created wc.account_userId_providerId_key. This
-- migration is a no-op when that index exists so `prisma migrate dev` and
-- `db push` stay in sync with @@unique([userId, providerId], map: "account_userId_providerId_key").
-- Apply with the manual wc migrate path (DIRECT_DATABASE_URL :5432). Vercel does not run migrations.

CREATE UNIQUE INDEX IF NOT EXISTS "account_userId_providerId_key" ON "wc"."account"("userId", "providerId");
