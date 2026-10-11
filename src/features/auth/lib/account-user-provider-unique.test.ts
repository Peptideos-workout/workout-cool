import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("docs SQL proposes a unique (userId, providerId) that is not applied from Prisma", () => {
  const sql = read("docs/sql/account-user-provider-unique.sql");
  const rollback = read("docs/sql/account-user-provider-unique.rollback.sql");

  assert.match(sql, /GROUP BY "userId", "providerId"/);
  assert.match(sql, /HAVING COUNT\(\*\) > 1/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /CREATE UNIQUE INDEX/);
  assert.match(sql, /"userId", "providerId"/);
  assert.match(rollback, /DROP INDEX/);

  const schema = read("prisma/schema.prisma");
  assert.match(schema, /@@unique\(\[providerId, accountId\]\)/);
  assert.doesNotMatch(schema, /@@unique\(\[userId, providerId\]\)/);

  assert.throws(() => read("prisma/migrations/20261011220000_account_user_provider_unique/migration.sql"), /ENOENT/);
});
