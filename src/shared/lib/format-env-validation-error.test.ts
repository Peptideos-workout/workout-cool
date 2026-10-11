import { test } from "node:test";
import assert from "node:assert/strict";

import { formatEnvValidationError } from "./format-env-validation-error";

test("names each missing required variable", () => {
  const message = formatEnvValidationError([
    { path: ["DATABASE_URL"], message: "Required" },
    { path: ["BETTER_AUTH_SECRET"], message: "Required" }
  ]);

  assert.match(message, /^Invalid environment variables:/);
  assert.match(message, /DATABASE_URL: Required/);
  assert.match(message, /BETTER_AUTH_SECRET: Required/);
});

test("names invalid enum variables and keeps the Zod reason", () => {
  const message = formatEnvValidationError([
    { path: ["SMTP_SECURE"], message: "Invalid enum value. Expected 'true' | 'false', received 'yes'" },
    { path: ["NEXT_PUBLIC_SHOW_ADS"], message: "Invalid enum value. Expected 'true' | 'false', received '1'" },
    {
      path: ["NEXT_PUBLIC_ENABLE_GATEKEEPER_CONSENT"],
      message: "Invalid enum value. Expected 'true' | 'false', received 'on'"
    },
    { path: ["NEXT_PUBLIC_AD_PROVIDER"], message: "Invalid enum value. Expected 'adsense' | 'ezoic' | 'custom', received 'AdSense'" }
  ]);

  assert.match(message, /SMTP_SECURE: Invalid enum value\. Expected 'true' \| 'false', received 'yes'/);
  assert.match(message, /NEXT_PUBLIC_SHOW_ADS: Invalid enum value\. Expected 'true' \| 'false', received '1'/);
  assert.match(message, /NEXT_PUBLIC_ENABLE_GATEKEEPER_CONSENT: Invalid enum value\. Expected 'true' \| 'false', received 'on'/);
  assert.match(message, /NEXT_PUBLIC_AD_PROVIDER: Invalid enum value\. Expected 'adsense' \| 'ezoic' \| 'custom', received 'AdSense'/);
});

test("uses the last path segment when t3-oss prefixes server or client", () => {
  const message = formatEnvValidationError([
    { path: ["server", "GOOGLE_CLIENT_ID"], message: "Required" },
    { path: ["client", "NEXT_PUBLIC_APP_URL"], message: "Invalid url" }
  ]);

  assert.match(message, /GOOGLE_CLIENT_ID: Required/);
  assert.match(message, /NEXT_PUBLIC_APP_URL: Invalid url/);
  assert.doesNotMatch(message, /server:/);
});
