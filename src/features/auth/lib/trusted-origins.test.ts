import { test } from "node:test";
import assert from "node:assert/strict";

import { betterAuthTrustedOrigins } from "./trusted-origins";

test("trusted origins are the configured app origin, never a wildcard", () => {
  const origins = betterAuthTrustedOrigins("https://workouts.example.test/app", "https://workouts.example.test");

  assert.ok(origins.includes("https://workouts.example.test"));
  assert.ok(!origins.includes("*"));
  assert.equal(origins.filter((origin) => origin === "https://workouts.example.test").length, 1);
});
