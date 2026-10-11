import { test } from "node:test";
import assert from "node:assert/strict";

import { LINK_RATE_LIMIT_MAX_IP, LINK_RATE_LIMIT_MAX_USER, LINK_RATE_LIMIT_WINDOW_MS, createLinkAttemptLimiter } from "./link-rate-limit";

test("locks out a user after repeated password failures in the window", () => {
  const now = 1_000;
  const limiter = createLinkAttemptLimiter({ now: () => now });

  for (let i = 0; i < LINK_RATE_LIMIT_MAX_USER; i += 1) {
    assert.equal(limiter.isLimited("user-1", "1.1.1.1"), false);
    limiter.recordFailure("user-1", "1.1.1.1");
  }

  assert.equal(limiter.isLimited("user-1", "1.1.1.1"), true);
  assert.equal(limiter.isLimited("user-2", "1.1.1.1"), false);
});

test("locks out an IP after repeated password failures across users", () => {
  const now = 1_000;
  const limiter = createLinkAttemptLimiter({ now: () => now });

  for (let i = 0; i < LINK_RATE_LIMIT_MAX_IP; i += 1) {
    limiter.recordFailure(`user-${i}`, "9.9.9.9");
  }

  assert.equal(limiter.isLimited("fresh-user", "9.9.9.9"), true);
  assert.equal(limiter.isLimited("fresh-user", "8.8.8.8"), false);
});

test("clears the window after it expires", () => {
  let now = 1_000;
  const limiter = createLinkAttemptLimiter({ now: () => now });

  for (let i = 0; i < LINK_RATE_LIMIT_MAX_USER; i += 1) {
    limiter.recordFailure("user-1", "1.1.1.1");
  }
  assert.equal(limiter.isLimited("user-1", "1.1.1.1"), true);

  now += LINK_RATE_LIMIT_WINDOW_MS + 1;
  assert.equal(limiter.isLimited("user-1", "1.1.1.1"), false);
});
