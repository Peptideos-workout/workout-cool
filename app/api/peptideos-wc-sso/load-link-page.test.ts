import { test } from "node:test";
import assert from "node:assert/strict";

import { loadLinkPeptideosPageState } from "./load-link-page";
import { createLinkCookiePayload, serializeLinkCookie } from "./link-cookie";

const secret = "test-better-auth-secret";
const now = 1_700_000_000_000;

test("link page shows a masked email for a valid cookie and never the raw address", async () => {
  const payload = createLinkCookiePayload({
    peptideosUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    wcUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    now,
    jti: "page-jti"
  });
  const header = await serializeLinkCookie(payload, secret);
  const cookieValue = header.split(";")[0].slice("peptideos_link=".length);

  const state = await loadLinkPeptideosPageState({
    cookieValue,
    secret,
    now,
    findUserById: async () => ({ email: "jane.doe@example.com" })
  });

  assert.deepEqual(state, { expired: false, maskedEmail: "j***@example.com" });
});

test("link page treats a missing or expired cookie as expired", async () => {
  const missing = await loadLinkPeptideosPageState({
    cookieValue: undefined,
    secret,
    now,
    findUserById: async () => ({ email: "jane@example.com" })
  });
  assert.deepEqual(missing, { expired: true });
});
