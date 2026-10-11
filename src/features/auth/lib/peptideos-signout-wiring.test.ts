import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("client logout clears the WC session then redirects to PeptideOS sign-out", () => {
  const src = read("src/features/auth/model/useLogout.ts");
  assert.match(src, /authClient\.signOut/);
  assert.match(src, /getConfiguredPeptideOsWorkoutsSignoutUrl|peptideOsWorkoutsSignoutUrl/);
  assert.match(src, /location\.assign|location\.href/);
  assert.doesNotMatch(src, /router\.push\(redirectUrl\)/);
});

test("auth sign-out page clears the WC session then redirects to PeptideOS sign-out", () => {
  const src = read("app/[locale]/(app)/auth/signout/page.tsx");
  assert.match(src, /auth\.api\.signOut|authClient\.signOut/);
  assert.match(src, /getConfiguredPeptideOsWorkoutsSignoutUrl|peptideOsWorkoutsSignoutUrl/);
  assert.match(src, /redirect\(/);
});
