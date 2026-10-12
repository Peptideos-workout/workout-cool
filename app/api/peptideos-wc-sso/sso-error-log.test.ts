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

test("a Prisma error whose message or meta contains a handoff token and an email logs neither", () => {
  const handoffToken = "plaintext-handoff-from-query-string";
  const email = "athlete@example.test";
  const query = `UPDATE public.workout_cool_handoffs SET consumed_at = NOW() WHERE secret_token = '${handoffToken}'`;
  const error = Object.assign(new Error(`Invalid prisma.$queryRaw() invocation:\n${query}\n${email}`), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    clientVersion: "6.5.0",
    meta: {
      email,
      target: ["email"],
      query,
      args: [handoffToken, email]
    }
  });

  const sanitized = sanitizeSsoErrorForLog(error);
  const lines = captureErrorLogs(() => {
    logSsoEvent("handoff_consume", error);
  });
  const logged = `${JSON.stringify(sanitized)}\n${lines.join("\n")}`;

  assert.equal(sanitized.name, "PrismaClientKnownRequestError");
  assert.equal(sanitized.code, "P2002");
  assert.equal(sanitized.message, undefined);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /\[peptideos-wc-sso\]/);
  assert.match(lines[0] ?? "", /handoff_consume/);
  assert.match(lines[0] ?? "", /P2002/);
  assert.doesNotMatch(logged, /plaintext-handoff-from-query-string/);
  assert.doesNotMatch(logged, /athlete@example\.test/);
  assert.doesNotMatch(logged, /secret_token/);
  assert.doesNotMatch(logged, /\$queryRaw/);
  assert.doesNotMatch(logged, /workout_cool_handoffs/);
  assert.doesNotMatch(logged, /clientVersion/);
  assert.doesNotMatch(logged, /"meta"/);
  assert.doesNotMatch(logged, /"args"/);
});

test("drops a 20-32 character token with no hyphen", () => {
  const token = "sk_live_fixturetoken01";
  assert.ok(token.length >= 20 && token.length <= 32);
  assert.equal(token.includes("-"), false);

  const error = Object.assign(new Error(`signup failed ${token} athlete@example.test`), {
    name: "Error",
    code: token,
    meta: { token, email: "athlete@example.test" }
  });
  const sanitized = sanitizeSsoErrorForLog(error);
  const lines = captureErrorLogs(() => {
    logSsoEvent("handoff_consume", error);
  });
  const logged = `${JSON.stringify(sanitized)}\n${lines.join("\n")}`;

  assert.equal(sanitized.name, "Error");
  assert.equal(sanitized.code, "");
  assert.equal(sanitized.message, undefined);
  assert.doesNotMatch(logged, /sk_live_fixturetoken01/);
  assert.doesNotMatch(logged, /athlete@example\.test/);
  assert.doesNotMatch(logged, /"meta"/);
});

test("drops an all-caps random token used as a code", () => {
  const token = "ABCDEFGHJKLMNPQRSTUVWX";
  assert.equal(token.includes("_"), false);
  assert.equal(token.length, 22);

  const error = Object.assign(new Error("signup failed"), { name: "APIError", code: token });
  const sanitized = sanitizeSsoErrorForLog(error);
  const lines = captureErrorLogs(() => {
    logSsoEvent("handoff_consume", error);
  });
  const logged = `${JSON.stringify(sanitized)}\n${lines.join("\n")}`;

  assert.equal(sanitized.name, "APIError");
  assert.equal(sanitized.code, "");
  assert.doesNotMatch(logged, /ABCDEFGHJKLMNPQRSTUVWX/);
  assert.equal(sanitizeSsoErrorForLog({ name: "APIError", code: "BAD_REQUEST" }).code, "BAD_REQUEST");
  assert.equal(sanitizeSsoErrorForLog({ name: "PrismaClientKnownRequestError", code: "P2002" }).code, "P2002");
  assert.equal(sanitizeSsoErrorForLog({ name: "Error", code: "42P01" }).code, "42P01");
});

test("logs an integer HTTP status and drops a non-integer status", () => {
  const lines = captureErrorLogs(() => {
    logSsoEvent("wc_signout", { name: "Response", status: 400, code: "ABCDEFGHJKLMNPQRSTUVWX" }, "signout_not_ok");
  });
  const logged = lines.join("\n");

  assert.equal(lines.length, 1);
  assert.match(logged, /"status":400/);
  assert.doesNotMatch(logged, /"status":"400"/);
  assert.doesNotMatch(logged, /ABCDEFGHJKLMNPQRSTUVWX/);
  assert.doesNotMatch(logged, /Response/);

  const rejected = captureErrorLogs(() => {
    logSsoEvent("wc_signout", { status: "400" }, "signout_not_ok");
    logSsoEvent("wc_signout", { status: 400.5 }, "signout_not_ok");
    logSsoEvent("wc_signout", { status: 99 }, "signout_not_ok");
    logSsoEvent("wc_signout", { status: 600 }, "signout_not_ok");
  });
  assert.doesNotMatch(rejected.join("\n"), /status/);
  assert.doesNotMatch(rejected.join("\n"), /400/);
  assert.doesNotMatch(rejected.join("\n"), /600/);
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
  assert.doesNotMatch(infos.join("\n"), /Response/);
  assert.doesNotMatch(infos.join("\n"), /400/);
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
