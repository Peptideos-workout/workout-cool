import { test } from "node:test";
import assert from "node:assert/strict";

import { allowBetterAuthUserCreate, isSsoUserCreateAllowed, runWithSsoUserCreate } from "./sso-user-create-context";

test("SSO user-create flag is off outside the in-process wrap", () => {
  assert.equal(isSsoUserCreateAllowed(), false);
  assert.equal(allowBetterAuthUserCreate(), false);
});

test("runWithSsoUserCreate allows user.create only for the wrapped callback", async () => {
  assert.equal(isSsoUserCreateAllowed(), false);
  const inside = await runWithSsoUserCreate(async () => {
    assert.equal(isSsoUserCreateAllowed(), true);
    assert.equal(allowBetterAuthUserCreate(), true);
    return "ok";
  });
  assert.equal(inside, "ok");
  assert.equal(isSsoUserCreateAllowed(), false);
  assert.equal(allowBetterAuthUserCreate(), false);
});

test("the flag is not readable from a header or other client input", () => {
  const src = require("node:fs").readFileSync("src/features/auth/lib/sso-user-create-context.ts", "utf8");
  assert.match(src, /AsyncLocalStorage/);
  assert.doesNotMatch(src, /req\.headers|x-sso|process\.env/);
});
