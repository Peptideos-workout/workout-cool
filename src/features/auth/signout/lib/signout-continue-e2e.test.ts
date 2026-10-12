import { test } from "node:test";
import { join } from "node:path";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

import { SIGNOUT_CONTINUE_COOKIE, SIGNOUT_CONTINUE_HOST_COOKIE, issueSignoutContinueToken } from "./signout-continue-token";

const SECRET = "test-better-auth-secret";
const PLACEHOLDER_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/workout-cool",
  BETTER_AUTH_URL: "https://workouts.example.test",
  NEXT_PUBLIC_APP_URL: "https://workouts.example.test",
  BETTER_AUTH_SECRET: SECRET,
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret"
};

function hasProductionBuild(): boolean {
  return existsSync(join(process.cwd(), ".next", "BUILD_ID"));
}

function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not bind an ephemeral port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(base: string, child: ReturnType<typeof spawn>, timeoutMs = 45_000): Promise<void> {
  const start = Date.now();
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited ${child.exitCode}: ${stderr}`);
    }
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`next start did not become ready: ${stderr}`);
}

function handoffKind(html: string): "auto-submit" | "confirm" | "unknown" {
  if (/data-signout-handoff="auto-submit"/.test(html)) {
    return "auto-submit";
  }
  if (/data-signout-handoff="confirm"/.test(html) || /<h1[^>]*>\s*Sign out\?\s*<\/h1>/.test(html)) {
    return "confirm";
  }
  return "unknown";
}

test("next start auto-submits a valid continue token and shows the click page on replay", async (t) => {
  if (!hasProductionBuild()) {
    t.skip("requires `pnpm build` so `next start` can boot");
    return;
  }

  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env: { ...PLACEHOLDER_ENV, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForHealth(base, child);

    const token = issueSignoutContinueToken(Date.now(), SECRET);
    assert.ok(token);
    const cookie = `${SIGNOUT_CONTINUE_HOST_COOKIE}=${token}; ${SIGNOUT_CONTINUE_COOKIE}=${token}`;

    const first = await fetch(`${base}/auth/signout/continue`, {
      headers: { cookie, "accept-language": "en" },
      redirect: "follow"
    });
    const firstHtml = await first.text();
    assert.equal(first.status, 200, firstHtml.slice(0, 800));
    assert.equal(handoffKind(firstHtml), "auto-submit", firstHtml.slice(0, 800));
    assert.match(first.headers.get("x-frame-options") ?? "", /DENY/i);
    assert.match(first.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.match(first.headers.get("content-security-policy") ?? "", /form-action/);
    assert.doesNotMatch(firstHtml, /<h1[^>]*>\s*Sign out\?\s*<\/h1>/);

    const replay = await fetch(`${base}/auth/signout/continue`, {
      headers: { cookie, "accept-language": "en" },
      redirect: "follow"
    });
    assert.equal(replay.status, 200);
    const replayHtml = await replay.text();
    assert.equal(handoffKind(replayHtml), "confirm", replayHtml.slice(0, 800));
    assert.match(replayHtml, /<h1[^>]*>\s*Sign out\?\s*<\/h1>/);
    assert.doesNotMatch(replayHtml, /data-signout-handoff="auto-submit"/);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve(undefined);
        return;
      }
      child.once("exit", () => resolve(undefined));
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve(undefined);
      }, 3_000);
    });
  }
});

test("continue page source exposes a handoff marker for the next-start e2e", () => {
  const page = readFileSync("app/[locale]/(app)/auth/signout/continue/page.tsx", "utf8");
  assert.match(page, /data-signout-handoff=\{autoSubmit \? "auto-submit" : "confirm"\}/);
});
