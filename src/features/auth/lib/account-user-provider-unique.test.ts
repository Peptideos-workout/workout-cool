import { test } from "node:test";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("Prisma Account has a schema-only unique (userId, providerId) matching the PeptideOS index name", () => {
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

  for (const entry of readdirSync("prisma/migrations", { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const migrationSql = join("prisma/migrations", entry.name, "migration.sql");
    try {
      assert.doesNotMatch(read(migrationSql), /account_userId_providerId_key/, migrationSql);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  assert.throws(() => read("prisma/migrations/20261011220000_account_user_provider_unique/migration.sql"), /ENOENT/);
});
