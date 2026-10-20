/**
 * Cross-origin iframe check for the signed-out embed home.
 *
 * A parent on another localhost port frames /en/?embed=1 and /en?embed=1 with no
 * cookie. Production frame-ancestors does not allow that parent. This script's
 * forwarder copies the browser request and appends only that parent origin on
 * the way back. The app, next.config.ts, and FRAME_ANCESTORS_CSP stay unchanged.
 *
 * Requires `pnpm build` and Playwright's Chromium (`pnpm exec playwright install chromium`).
 */
const { join } = require("node:path");
const { createServer: createNetServer } = require("node:net");
const { createServer, request: httpRequest } = require("node:http");
const { existsSync, readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");

const PRODUCTION_CSP = "frame-ancestors 'self' https://peptideos.us https://www.peptideos.us";

const PLACEHOLDER_ENV = {
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

function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
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

function assertProductionSources() {
  const frameAncestors = readFileSync(join(process.cwd(), "src/shared/lib/frame-ancestors.ts"), "utf8");
  const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  const headersBlock = nextConfig.slice(nextConfig.indexOf("async headers("), nextConfig.indexOf("reactStrictMode"));
  if (!frameAncestors.includes(`"${PRODUCTION_CSP}"`)) {
    throw new Error("FRAME_ANCESTORS_CSP is no longer the PeptideOS allowlist");
  }
  if (/localhost|127\.0\.0\.1/.test(frameAncestors)) {
    throw new Error("src/shared/lib/frame-ancestors.ts must not allow localhost");
  }
  if (!headersBlock.includes("value: FRAME_ANCESTORS_CSP")) {
    throw new Error("next.config.ts headers must keep FRAME_ANCESTORS_CSP");
  }
  if (/localhost|127\.0\.0\.1|frame-ancestors/.test(headersBlock)) {
    throw new Error("next.config.ts headers must not add a frame-ancestors source");
  }
}

function startParent(port, slashSrc, plainSrc) {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>embed parent</title></head><body>` +
        `<iframe id="slash" name="slash" title="slash" src="${slashSrc}"></iframe>` +
        `<iframe id="plain" name="plain" title="plain" src="${plainSrc}"></iframe>` +
        `</body></html>`
    );
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function startForwarder(port, upstreamPort, parentOrigin, hops) {
  const server = createServer((incoming, outgoing) => {
    const headers = { ...incoming.headers, host: `127.0.0.1:${upstreamPort}` };
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: upstreamPort,
        path: incoming.url,
        method: incoming.method,
        headers
      },
      (upstreamResponse) => {
        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          const body = Buffer.concat(chunks);
          const headersOut = { ...upstreamResponse.headers };
          const originalCsp = headersOut["content-security-policy"];
          const csp = Array.isArray(originalCsp) ? originalCsp.join("; ") : originalCsp || "";
          if (csp) {
            headersOut["content-security-policy"] = csp.replace(
              "frame-ancestors 'self'",
              `frame-ancestors 'self' ${parentOrigin}`
            );
          }
          delete headersOut["transfer-encoding"];
          headersOut["content-length"] = String(body.length);
          hops.push({
            path: incoming.url || "",
            dest: incoming.headers["sec-fetch-dest"] || "",
            mode: incoming.headers["sec-fetch-mode"] || "",
            referer: incoming.headers.referer || "",
            cookie: incoming.headers.cookie || "",
            status: upstreamResponse.statusCode || 0,
            location: upstreamResponse.headers.location || "",
            csp
          });
          outgoing.writeHead(upstreamResponse.statusCode || 502, headersOut);
          outgoing.end(body);
        });
      }
    );
    upstream.on("error", (error) => {
      outgoing.writeHead(502, { "content-type": "text/plain" });
      outgoing.end(String(error));
    });
    incoming.pipe(upstream);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function waitForHealth(base, child) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`next start exited ${child.exitCode}: ${stderr.slice(-500)}`));
        return;
      }
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Still booting.
      }
      if (Date.now() - started > 45000) {
        reject(new Error(`next start did not become ready: ${stderr.slice(-500)}`));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function stopChild(child) {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
  });
}

function assertHop(hop, expected, label) {
  if (!hop) throw new Error(`${label} request was not seen`);
  if (hop.status !== expected.status) throw new Error(`${label} status ${hop.status}`);
  if (hop.dest !== "iframe") throw new Error(`${label} Sec-Fetch-Dest ${hop.dest}`);
  if (hop.mode !== "navigate") throw new Error(`${label} Sec-Fetch-Mode ${hop.mode}`);
  if (hop.referer !== expected.referer) throw new Error(`${label} Referer ${hop.referer}`);
  if (hop.cookie) throw new Error(`${label} sent a cookie`);
  if (hop.csp.includes("localhost") || hop.csp.includes("127.0.0.1")) {
    throw new Error(`${label} upstream CSP allows a local parent`);
  }
  if (expected.status === 200 && hop.csp !== PRODUCTION_CSP) throw new Error(`${label} upstream CSP ${hop.csp}`);
  if (expected.location && hop.location !== expected.location) throw new Error(`${label} Location ${hop.location}`);
}

async function frameState(frame) {
  return frame.evaluate(() => ({
    title: document.title,
    fallback: Boolean(document.querySelector("[data-wc-embed-fallback]")),
    shell: Boolean(document.querySelector("[data-wc-shell]")),
    steps: Boolean(document.querySelector("[data-wc-steps]")),
    equipment: Boolean(document.querySelector("[data-wc-equipment-bar]"))
  }));
}

function assertSignedOut(state, label) {
  if (state.title !== "Signed out") throw new Error(`${label} title ${state.title}`);
  if (!state.fallback) throw new Error(`${label} did not render the signed-out embed document`);
  if (state.shell || state.steps || state.equipment) throw new Error(`${label} rendered the workout builder`);
}

async function main() {
  assertProductionSources();
  if (!existsSync(join(process.cwd(), ".next", "BUILD_ID"))) {
    throw new Error("pnpm test:embed-iframe needs a production build. Run pnpm build first.");
  }

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    throw new Error(`Playwright is not installed (${error.message}). Run pnpm install, then pnpm exec playwright install chromium.`);
  }

  const appPort = await unusedPort();
  const parentPort = await unusedPort();
  const forwardPort = await unusedPort();
  const parentOrigin = `http://127.0.0.1:${parentPort}`;
  const forwardOrigin = `http://127.0.0.1:${forwardPort}`;
  const hops = [];
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(appPort), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env: { ...PLACEHOLDER_ENV, PORT: String(appPort) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let parent;
  let forwarder;
  let browser;

  try {
    await waitForHealth(`http://127.0.0.1:${appPort}`, child);
    forwarder = await startForwarder(forwardPort, appPort, parentOrigin, hops);
    const slashSrc = `${forwardOrigin}/en/?embed=1`;
    const plainSrc = `${forwardOrigin}/en?embed=1`;
    parent = await startParent(parentPort, slashSrc, plainSrc);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.clearCookies();
    const page = await context.newPage();
    await page.goto(`${parentOrigin}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500);

    const slash = page.frame({ name: "slash" });
    const plain = page.frame({ name: "plain" });
    const frameUrls = page.frames().map((frame) => frame.url()).join(" ");
    if (!slash || !slash.url().includes("/en?embed=1") || slash.url().includes("/en/?embed=1")) {
      throw new Error(`slash iframe did not reach /en?embed=1 (${frameUrls})`);
    }
    if (!plain || plain.url() !== plainSrc) {
      throw new Error(`plain iframe did not stay on /en?embed=1 (${frameUrls})`);
    }
    assertSignedOut(await frameState(slash), "/en/?embed=1");
    assertSignedOut(await frameState(plain), "/en?embed=1");

    const iframeHops = hops.filter((hop) => hop.dest === "iframe");
    const slashHop = iframeHops.find((hop) => hop.path === "/en/?embed=1");
    const followed = iframeHops.filter((hop) => hop.path === "/en?embed=1");
    assertHop(slashHop, { status: 308, referer: `${parentOrigin}/`, location: "/en?embed=1" }, "/en/?embed=1");
    if (followed.length < 2) throw new Error(`expected two /en?embed=1 iframe responses, saw ${followed.length}`);
    for (const hop of followed) {
      assertHop(hop, { status: 200, referer: `${parentOrigin}/` }, "/en?embed=1");
    }
    console.log("embed iframe: /en/?embed=1 and /en?embed=1 rendered the signed-out document");
  } finally {
    if (browser) await browser.close();
    if (parent) await new Promise((resolve) => parent.close(resolve));
    if (forwarder) await new Promise((resolve) => forwarder.close(resolve));
    await stopChild(child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
