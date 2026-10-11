import { test } from "node:test";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("Prisma Account unique (userId, providerId) matches the PeptideOS index name with a no-op migration", () => {
  const sql = read("docs/sql/account-user-provider-unique.sql");
  const rollback = read("docs/sql/account-user-provider-unique.rollback.sql");

  assert.match(sql, /GROUP BY "userId", "providerId"/);
  assert.match(sql, /HAVING COUNT\(\*\) > 1/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /CREATE UNIQUE INDEX "account_userId_providerId_key"/);
  assert.match(sql, /"userId", "providerId"/);
  assert.match(rollback, /DROP INDEX IF EXISTS wc\."account_userId_providerId_key"/);

  const schema = read("prisma/schema.prisma");
  assert.match(schema, /@@unique\(\[providerId, accountId\]\)/);
  assert.match(schema, /@@unique\(\[userId, providerId\],\s*map:\s*"account_userId_providerId_key"\)/);

  const migrationDirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name.includes("account_user_provider_unique")
  );
  assert.equal(migrationDirs.length, 1);
  const migrationSql = read(join("prisma/migrations", migrationDirs[0].name, "migration.sql"));
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS "account_userId_providerId_key"/);
  assert.match(migrationSql, /ON "wc"\."account"\("userId", "providerId"\)/);
  assert.doesNotMatch(migrationSql, /CREATE UNIQUE INDEX "account_userId_providerId_key"/);
});
