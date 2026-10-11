import { test } from "node:test";
import assert from "node:assert/strict";

import { PASSWORD_CHANGE_KIND, resolvePasswordChangeKind } from "./password-change-entry";

const SETTINGS = "https://peptideos.us/settings#password";

test("shows PeptideOS change-password for a linked email/password identity", () => {
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: [{ providerId: "peptideos" }],
      hasEmailIdentity: true,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.peptideosSettings, href: SETTINGS }
  );
});

test("hides change-password for Google/OAuth-only PeptideOS users", () => {
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: [{ providerId: "peptideos" }, { providerId: "google" }],
      hasEmailIdentity: false,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.hidden }
  );
});

test("fails closed when the email-identity check is unknown", () => {
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: [{ providerId: "peptideos" }],
      hasEmailIdentity: null,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.hidden }
  );
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: [{ providerId: "peptideos" }],
      hasEmailIdentity: undefined,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.hidden }
  );
});

test("does not offer a local workout-cool password form for leftover credential rows", () => {
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: [{ providerId: "credential" }],
      hasEmailIdentity: null,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.hidden }
  );
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: [{ providerId: "peptideos" }, { providerId: "credential" }],
      hasEmailIdentity: true,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.peptideosSettings, href: SETTINGS }
  );
});

test("hides when accounts are missing or only have a non-password provider", () => {
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: undefined,
      hasEmailIdentity: true,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.hidden }
  );
  assert.deepEqual(
    resolvePasswordChangeKind({
      accounts: [{ providerId: "google" }],
      hasEmailIdentity: true,
      peptideosSettingsUrl: SETTINGS
    }),
    { kind: PASSWORD_CHANGE_KIND.hidden }
  );
});
