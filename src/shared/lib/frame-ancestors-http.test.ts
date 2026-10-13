import { test } from "node:test";
import { join } from "node:path";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

import { FRAME_ANCESTORS_CSP } from "./frame-ancestors";

const PLACEHOLDER_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/workout-cool",
  BETTER_AUTH_URL: "https://workouts.example.test",
  NEXT_PUBLIC_APP_URL: "https://workouts.example.test",
  BETTER_AUTH_SECRET: "test-better-auth-secret",
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

function assertExactFrameAncestors(response: Response, label: string) {
  assert.equal(response.headers.get("content-security-policy"), FRAME_ANCESTORS_CSP, label);
  assert.equal(response.headers.get("x-frame-options"), null, label);
}

test("next start sends one frame-ancestors header on pages, API, auth, sign-out, SSO errors, and the locale redirect", async (t) => {
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

    const page = await fetch(`${base}/en/about`, { headers: { "accept-language": "en" }, redirect: "manual" });
    assert.equal(page.status, 200);
    assertExactFrameAncestors(page, "page");

    const api = await fetch(`${base}/api/health`, { redirect: "manual" });
    assert.equal(api.status, 200);
    assertExactFrameAncestors(api, "api");

    const auth = await fetch(`${base}/api/auth/sign-up/email`, { redirect: "manual" });
    assert.equal(auth.status, 403);
    assertExactFrameAncestors(auth, "auth");

    const signout = await fetch(`${base}/api/peptideos-wc-signout`, { redirect: "manual" });
    assert.equal(signout.status, 405);
    assert.equal(signout.headers.get("allow"), "POST");
    assertExactFrameAncestors(signout, "signout");

    const locale = await fetch(`${base}/`, { redirect: "manual" });
    assert.equal(locale.status, 307);
    assert.match(locale.headers.get("location") ?? "", /\/en$/);
    assertExactFrameAncestors(locale, "locale redirect");

    const sso = await fetch(`${base}/api/peptideos-wc-sso`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: "token=not-a-handoff",
      redirect: "manual"
    });
    assert.equal(sso.status, 403);
    assert.match(sso.headers.get("content-type") ?? "", /text\/html/);
    assertExactFrameAncestors(sso, "sso error");

    const confirm = await fetch(`${base}/auth/signout`, { headers: { "accept-language": "en" }, redirect: "follow" });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.headers.get("content-security-policy"), "frame-ancestors 'none'");
    assert.match(confirm.headers.get("x-frame-options") ?? "", /DENY/i);

    const continuePage = await fetch(`${base}/auth/signout/continue`, {
      headers: { "accept-language": "en" },
      redirect: "follow"
    });
    assert.equal(continuePage.status, 200);
    const continueCsp = continuePage.headers.get("content-security-policy") ?? "";
    assert.match(continueCsp, /form-action /);
    assert.match(continueCsp, /frame-ancestors 'none'/);
    assert.equal(continueCsp.split("frame-ancestors").length - 1, 1);
    assert.match(continuePage.headers.get("x-frame-options") ?? "", /DENY/i);
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
