import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("hop C route is GET /api/peptideos-wc-signout and clears the WC session", () => {
  const src = read("app/api/peptideos-wc-signout/route.ts");
  assert.match(src, /export async function GET/);
  assert.match(src, /runPeptideOsWcSignout|auth\.api\.signOut/);
  assert.match(src, /peptideOsOrigin/);
  assert.doesNotMatch(src, /peptideOsWorkoutsSignoutUrl|workouts\/signout\/continue|from-peptideos/);
});

test("hop C must not POST back to PeptideOS sign-out (no hop B)", () => {
  const route = read("app/api/peptideos-wc-signout/route.ts");
  const runner = read("app/api/peptideos-wc-signout/run-wc-signout.ts");
  assert.doesNotMatch(route, /PEPTIDEOS_WORKOUTS_SIGNOUT_PATH|peptideOsWorkoutsSignout/);
  assert.doesNotMatch(runner, /PEPTIDEOS_WORKOUTS_SIGNOUT_PATH|peptideOsWorkoutsSignout/);
  assert.doesNotMatch(runner, /auth\/signout\/continue/);
});

test("PeptideOS-initiated from-peptideos page is removed in favor of hop C", () => {
  assert.equal(existsSync("app/[locale]/(app)/auth/signout/from-peptideos/page.tsx"), false);
});
