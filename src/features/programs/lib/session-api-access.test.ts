import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { PROGRAM_SESSION_API_IS_PUBLIC, programSessionApiUnauthorizedBody } from "./session-api-access";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("program session API is gated behind a workout-cool session", () => {
  assert.equal(PROGRAM_SESSION_API_IS_PUBLIC, false);
  assert.deepEqual(programSessionApiUnauthorizedBody(), { error: "Unauthorized" });

  const src = read("app/api/programs/[slug]/sessions/[sessionSlug]/route.ts");
  assert.match(src, /auth\.api\.getSession|getMobileCompatibleSession/);
  assert.match(src, /401/);
  assert.match(src, /Unauthorized/);
  assert.match(src, /PROGRAM_SESSION_API_IS_PUBLIC|session-api-access/);
});
