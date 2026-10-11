import { test } from "node:test";
import assert from "node:assert/strict";

import { configuredWorkoutOrigin } from "./workout-origin";

test("pins SSO origin to BETTER_AUTH_URL and ignores request-like forwarded hosts", () => {
  const request = {
    headers: {
      get(name: string) {
        if (name === "x-forwarded-host") return "evil.example";
        if (name === "x-forwarded-proto") return "https";
        if (name === "host") return "evil.example";
        return null;
      }
    },
    nextUrl: { origin: "https://evil.example" }
  };

  const origin = configuredWorkoutOrigin("https://workouts.peptideos.test/app", "https://unused.example");

  assert.equal(origin, "https://workouts.peptideos.test");
  assert.notEqual(origin, request.nextUrl.origin);
  assert.notEqual(origin, "https://evil.example");
});

test("falls back to NEXT_PUBLIC_APP_URL when BETTER_AUTH_URL is unset", () => {
  assert.equal(configuredWorkoutOrigin(undefined, "https://workouts.example.test/"), "https://workouts.example.test");
});

test("does not read X-Forwarded-Host when choosing the origin", () => {
  const forwarded = "attacker.example";
  const origin = configuredWorkoutOrigin("https://workouts.example.test", undefined);

  assert.equal(origin, "https://workouts.example.test");
  assert.doesNotMatch(origin, new RegExp(forwarded.replace(".", "\\.")));
});
