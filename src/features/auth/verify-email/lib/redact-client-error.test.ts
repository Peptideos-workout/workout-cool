import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { logRedactedClientError } from "./redact-client-error";

function captureErrorLogs(run: () => void): string[] {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    run();
  } finally {
    console.error = original;
  }
  return lines;
}

test("client logger keeps a known name and code and drops email, token, and stack", () => {
  const token = "sk_live_fixturetoken01";
  const email = "athlete@example.test";
  const error = Object.assign(new Error(`resend failed ${email} ${token}`), {
    code: "P2002",
    stack: `Error: ${email}\n    at useResendEmail (${token})`
  });

  const lines = captureErrorLogs(() => {
    logRedactedClientError("resend_verification_email", error);
  });
  const logged = lines.join("\n");

  assert.equal(lines.length, 1);
  assert.match(logged, /\[auth\]/);
  assert.match(logged, /resend_verification_email/);
  assert.match(logged, /"name":"Error"/);
  assert.match(logged, /P2002/);
  assert.doesNotMatch(logged, /athlete@example\.test/);
  assert.doesNotMatch(logged, /sk_live_fixturetoken01/);
  assert.doesNotMatch(logged, /stack/);
  assert.doesNotMatch(logged, /resend failed/);
});

test("client logger drops a hyphen-free token used as the code", () => {
  const token = "sk_live_fixturetoken01";
  assert.ok(token.length >= 20 && token.length <= 32);
  assert.equal(token.includes("-"), false);

  const lines = captureErrorLogs(() => {
    logRedactedClientError("resend_verification_email", { name: "Response", code: token, message: token });
  });
  const logged = lines.join("\n");

  assert.doesNotMatch(logged, /sk_live_fixturetoken01/);
  assert.doesNotMatch(logged, /Response/);
  assert.doesNotMatch(logged, /message/);
});

test("client logger drops an all-caps random token used as a code", () => {
  const token = "ABCDEFGHJKLMNPQRSTUVWX";
  assert.equal(token.includes("_"), false);
  assert.equal(token.length, 22);

  const lines = captureErrorLogs(() => {
    logRedactedClientError("resend_verification_email", { name: "APIError", code: token, message: token });
  });
  const logged = lines.join("\n");

  assert.match(logged, /"name":"APIError"/);
  assert.doesNotMatch(logged, /ABCDEFGHJKLMNPQRSTUVWX/);
  assert.doesNotMatch(logged, /"code"/);

  const kept = captureErrorLogs(() => {
    logRedactedClientError("resend_verification_email", { name: "APIError", code: "BAD_REQUEST" });
  });
  assert.match(kept.join("\n"), /BAD_REQUEST/);
});

test("useResendEmail does not import the server SSO logger", () => {
  const source = readFileSync(new URL("../model/useResendEmail.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /sso-error-log/);
  assert.match(source, /logRedactedClientError/);
});
