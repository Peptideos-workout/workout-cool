import { test } from "node:test";
import assert from "node:assert/strict";

import { logSsoEmailCollision, sanitizeSsoErrorForLog } from "./sso-error-log";

test("redacts email, JWT, hex tokens, and secret assignments from collision logs", () => {
  const sanitized = sanitizeSsoErrorForLog(
    new Error("User already exists: victim@example.com token=abc.def.ghi secret=supersecret eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  );

  assert.equal(sanitized.name, "Error");
  assert.doesNotMatch(sanitized.message, /victim@example.com/i);
  assert.doesNotMatch(sanitized.message, /supersecret/);
  assert.doesNotMatch(sanitized.message, /eyJhbGciOiJIUzI1NiJ9/);
  assert.doesNotMatch(sanitized.message, /0123456789abcdef0123456789abcdef/);
  assert.match(sanitized.message, /\[email\]|\[token\]|\[hex\]|\[redacted\]/);
});

test("keeps prisma-style codes and omits nested meta that can hold PII", () => {
  const sanitized = sanitizeSsoErrorForLog({
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    message: "Unique constraint failed on the fields: (`email`)",
    meta: { target: ["email"], email: "victim@example.com" }
  });

  assert.equal(sanitized.code, "P2002");
  assert.match(sanitized.message, /Unique constraint failed/);
  assert.doesNotMatch(JSON.stringify(sanitized), /victim@example.com/);
  assert.ok(!("meta" in sanitized));
});

test("logSsoEmailCollision writes a generic 409 reason and never prints the raw token", () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };

  try {
    logSsoEmailCollision("signup_threw", new Error("handoff token=plaintext-handoff-from-query-string"));
  } finally {
    console.error = original;
  }

  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /\[peptideos-wc-sso\] sso_email_collision/);
  assert.match(lines[0] ?? "", /signup_threw/);
  assert.doesNotMatch(lines[0] ?? "", /plaintext-handoff-from-query-string/);
});
