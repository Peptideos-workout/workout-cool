import { test } from "node:test";
import assert from "node:assert/strict";

import { createPeptideosAccountLink } from "./create-peptideos-account";
import { isAccountUniqueViolation } from "./account-unique-violation";

test("detects Prisma P2002 and Postgres 23505 unique violations", () => {
  assert.equal(isAccountUniqueViolation({ code: "P2002" }), true);
  assert.equal(isAccountUniqueViolation({ code: "23505" }), true);
  assert.equal(isAccountUniqueViolation(Object.assign(new Error("unique"), { code: "P2002" })), true);
  assert.equal(isAccountUniqueViolation({ cause: { code: "23505" } }), true);
  assert.equal(isAccountUniqueViolation({ code: "P2003" }), false);
  assert.equal(isAccountUniqueViolation(new Error("boom")), false);
  assert.equal(isAccountUniqueViolation(undefined), false);
});

test("createPeptideosAccountLink returns a 409 collision on unique violations", async () => {
  const p2002 = await createPeptideosAccountLink({
    userId: "wc-user",
    peptideosUserId: "hid",
    insert: async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
  });
  assert.deepEqual(p2002, { ok: false, error: "sso_email_collision", status: 409 });

  const pg = await createPeptideosAccountLink({
    userId: "wc-user",
    peptideosUserId: "hid",
    insert: async () => {
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    }
  });
  assert.deepEqual(pg, { ok: false, error: "sso_email_collision", status: 409 });
});

test("createPeptideosAccountLink rethrows non-unique errors", async () => {
  await assert.rejects(
    () =>
      createPeptideosAccountLink({
        userId: "wc-user",
        peptideosUserId: "hid",
        insert: async () => {
          throw new Error("connection refused");
        }
      }),
    /connection refused/
  );
});
