import { test } from "node:test";
import assert from "node:assert/strict";

import { logSsoEmailCollision, logSsoEvent, sanitizeSsoErrorForLog } from "./sso-error-log";

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

test("logs only name, code, and allowlisted messages — never passwords, hashes, or tokens", () => {
  const sanitized = sanitizeSsoErrorForLog(
    new Error("password=hunter2 $2b$10$abcdefghijklmnopqrstuv bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig session_token=sess_live_abc"),
  );

  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.name, "Error");
  assert.equal(sanitized.code, "");
  assert.equal(sanitized.message, undefined);
  assert.doesNotMatch(serialized, /hunter2/);
  assert.doesNotMatch(serialized, /\$2b\$10\$/);
  assert.doesNotMatch(serialized, /eyJhbGciOiJIUzI1NiJ9/);
  assert.doesNotMatch(serialized, /sess_live_abc/);
  assert.doesNotMatch(serialized, /password=/);
});

test("keeps prisma-style codes and an allowlisted unique-constraint message, never meta PII", () => {
  const sanitized = sanitizeSsoErrorForLog({
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    message: "Unique constraint failed on the fields: (`email`)",
    meta: { target: ["email"], email: "victim@example.com" }
  });

  assert.equal(sanitized.name, "PrismaClientKnownRequestError");
  assert.equal(sanitized.code, "P2002");
  assert.equal(sanitized.message, "Unique constraint failed on the fields: (`email`)");
  assert.doesNotMatch(JSON.stringify(sanitized), /victim@example.com/);
  assert.ok(!("meta" in sanitized));
});

test("drops a collision message that is not on the allowlist", () => {
  const sanitized = sanitizeSsoErrorForLog(new Error("User already exists: victim@example.com"));
  assert.equal(sanitized.message, undefined);
  assert.doesNotMatch(JSON.stringify(sanitized), /victim@example.com/);
});

test("logSsoEmailCollision writes reason plus safe fields and never the raw token", () => {
  const lines = captureErrorLogs(() => {
    logSsoEmailCollision("signup_threw", new Error("handoff token=plaintext-handoff-from-query-string"));
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /\[peptideos-wc-sso\]/);
  assert.match(lines[0] ?? "", /sso_email_collision/);
  assert.match(lines[0] ?? "", /signup_threw/);
  assert.doesNotMatch(lines[0] ?? "", /plaintext-handoff-from-query-string/);
});

test("logSsoEvent info and debug do not write console.error", () => {
  const errors: string[] = [];
  const infos: string[] = [];
  const originalError = console.error;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  console.info = (...args: unknown[]) => {
    infos.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  console.debug = (...args: unknown[]) => {
    infos.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    logSsoEvent("wc_signout", { name: "Response", code: "400" }, "signout_no_session", "info");
    logSsoEvent("wc_signout", { name: "Response", code: "400" }, "signout_no_session", "debug");
  } finally {
    console.error = originalError;
    console.info = originalInfo;
    console.debug = originalDebug;
  }

  assert.equal(errors.length, 0);
  assert.match(infos.join("\n"), /signout_no_session/);
  assert.match(infos.join("\n"), /\[peptideos-wc-sso\]/);
});

test("logSsoEvent never prints stacks or raw Error objects", () => {
  const lines = captureErrorLogs(() => {
    logSsoEvent("auth_users_lookup", Object.assign(new Error("relation auth.users does not exist"), { code: "42P01" }));
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /auth_users_lookup/);
  assert.match(lines[0] ?? "", /42P01/);
  assert.doesNotMatch(lines[0] ?? "", /at Object\./);
  assert.doesNotMatch(lines[0] ?? "", /Error: relation/);
});
