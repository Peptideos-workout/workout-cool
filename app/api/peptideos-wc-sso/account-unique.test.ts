import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { ACCOUNT_PROVIDER_ACCOUNT_DEDUPE_SQL, ACCOUNT_PROVIDER_ACCOUNT_DUPLICATE_SQL } from "./account-unique";

test("duplicate-check SQL groups by providerId and accountId", () => {
  assert.match(ACCOUNT_PROVIDER_ACCOUNT_DUPLICATE_SQL, /GROUP BY "providerId", "accountId"/);
  assert.match(ACCOUNT_PROVIDER_ACCOUNT_DUPLICATE_SQL, /HAVING COUNT\(\*\) > 1/);
});

test("dedupe SQL keeps the oldest row per provider/account pair", () => {
  assert.match(ACCOUNT_PROVIDER_ACCOUNT_DEDUPE_SQL, /ORDER BY "createdAt" ASC/);
  assert.match(ACCOUNT_PROVIDER_ACCOUNT_DEDUPE_SQL, /WHERE d.rn > 1/);
});

test("Prisma migration refuses to add the unique index while duplicates exist", () => {
  const sql = readFileSync("prisma/migrations/20261011182100_account_provider_account_unique/migration.sql", "utf8");
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /CREATE UNIQUE INDEX "account_providerId_accountId_key"/);
});
