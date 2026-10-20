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
const { tmpdir } = require("node:os");
const { createServer: createNetServer } = require("node:net");
const { createServer, request: httpRequest } = require("node:http");
const { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
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
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
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
        `</body></html>`,
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
        headers,
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
            headersOut["content-security-policy"] = csp.replace("frame-ancestors 'self'", `frame-ancestors 'self' ${parentOrigin}`);
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
            csp,
          });
          outgoing.writeHead(upstreamResponse.statusCode || 502, headersOut);
          outgoing.end(body);
        });
      },
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
    equipment: Boolean(document.querySelector("[data-wc-equipment-bar]")),
  }));
}

function assertSignedOut(state, label) {
  if (state.title !== "Signed out") throw new Error(`${label} title ${state.title}`);
  if (!state.fallback) throw new Error(`${label} did not render the signed-out embed document`);
  if (state.shell || state.steps || state.equipment) throw new Error(`${label} rendered the workout builder`);
}

function localeValue(name) {
  const source = readFileSync(join(process.cwd(), "locales/en.ts"), "utf8");
  const match = source.match(new RegExp("(^|[^A-Za-z0-9_])" + name + ': "([^"]*)"', "m"));
  if (!match) throw new Error(`missing en locale ${name}`);
  return match[2];
}

function loadEsbuild() {
  try {
    return require("esbuild");
  } catch {
    const nextPkg = require.resolve("next/package.json");
    return require(require.resolve("esbuild", { paths: [join(nextPkg, "..")] }));
  }
}

function builtStyles() {
  const roots = [join(process.cwd(), ".next", "static", "css"), join(process.cwd(), ".next", "static", "chunks")];
  const files = roots.flatMap((dir) =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith(".css"))
          .map((name) => join(dir, name))
      : [],
  );
  if (!files.length) throw new Error("production CSS is missing. Run pnpm build first.");
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}

function bundleQuitHarness(dir) {
  const copy = {
    "workout_builder.session.quit_workout": localeValue("quit_workout"),
    "workout_builder.session.quit_workout_title": localeValue("quit_workout_title"),
    "workout_builder.session.quit_warning": localeValue("quit_warning"),
    "workout_builder.session.quit_without_save": localeValue("quit_without_save"),
    "workout_builder.session.continue_workout": localeValue("continue_workout"),
    "workout_builder.session.embed_quit_title": localeValue("embed_quit_title"),
    "workout_builder.session.embed_quit_warning": localeValue("embed_quit_warning"),
    "workout_builder.session.embed_quit_confirm": localeValue("embed_quit_confirm"),
    "workout_builder.session.embed_quit_cancel": localeValue("embed_quit_cancel"),
    "workout_builder.session.workout_in_progress": localeValue("workout_in_progress"),
    "workout_builder.session.started_at": localeValue("started_at"),
    "workout_builder.session.exercise_progress": localeValue("exercise_progress"),
    "workout_builder.session.total_volume": localeValue("total_volume"),
    "workout_builder.session.complete": localeValue("complete"),
    "workout_builder.session.progress": localeValue("progress"),
    "workout_builder.session.delete_workout_title": localeValue("delete_workout_title"),
    "workout_builder.confirm_delete": localeValue("confirm_delete"),
    "workout_builder.session.delete": localeValue("delete"),
    "commons.cancel": localeValue("cancel"),
  };
  const i18nStub = join(dir, "i18n-stub.js");
  const builderStub = join(dir, "builder-stub.ts");
  const prismaStub = join(dir, "prisma-stub.js");
  const sessionsStub = join(dir, "sessions-stub.js");
  const serviceStub = join(dir, "service-stub.js");
  const navigationStub = join(dir, "navigation-stub.js");
  const linkStub = join(dir, "link-stub.jsx");
  const entry = join(dir, "harness.tsx");
  writeFileSync(
    i18nStub,
    `const strings = ${JSON.stringify(copy)};
export function useI18n() {
  return (key) => strings[key] ?? key;
}
export function useCurrentLocale() {
  return "en";
}
`,
  );
  writeFileSync(
    builderStub,
    `import { create } from "zustand";
export const useWorkoutBuilderStore = create((set) => ({
  currentStep: 1,
  setStep: (step) => set({ currentStep: step })
}));
`,
  );
  writeFileSync(
    prismaStub,
    `export const ExerciseAttributeValueEnum = {};
export const ExerciseAttributeNameEnum = {};
export function PrismaClient() {}
`,
  );
  writeFileSync(
    sessionsStub,
    `import { useState } from "react";
const historySession = {
  id: "hist-1",
  status: "completed",
  startedAt: "2026-01-02T15:04:00.000Z",
  endedAt: "2026-01-02T16:00:00.000Z",
  muscles: [],
  exercises: [{ id: "ex-1", name: "Squat", nameEn: "Squat", order: 0, attributes: [] }]
};
export function useWorkoutSessions() {
  const [data, setData] = useState(() => (window.__wcSessions || [historySession]).slice());
  return {
    data,
    refetch() {
      setData((window.__wcSessions || []).slice());
    }
  };
}
`,
  );
  writeFileSync(
    serviceStub,
    `import { workoutSessionLocal } from "@/shared/lib/workout-session/workout-session.local";
export const useWorkoutSessionService = () => ({
  getAll: async () => workoutSessionLocal.getAll(),
  add: async (session) => workoutSessionLocal.add(session),
  update: async () => {},
  complete: async () => {},
  remove: async (id) => {
    window.__wcRemoveCalls = (window.__wcRemoveCalls || 0) + 1;
    if (typeof window.__wcHoldRemove === "function") await window.__wcHoldRemove();
    window.__wcSessions = (window.__wcSessions || []).filter((session) => session.id !== id);
    workoutSessionLocal.remove(id);
  }
});
`,
  );
  writeFileSync(
    navigationStub,
    `export function useRouter() {
  return { push() {}, replace() {}, back() {}, prefetch() {} };
}
export function usePathname() { return "/"; }
export function useSearchParams() { return new URLSearchParams(); }
`,
  );
  writeFileSync(
    linkStub,
    `import { forwardRef } from "react";
const Link = forwardRef(function Link({ children, href, prefetch, ...props }, ref) {
  return <a href={typeof href === "string" ? href : "#"} ref={ref} {...props}>{children}</a>;
});
export default Link;
`,
  );
  writeFileSync(
    entry,
    `import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useWorkoutSessionStore } from "@/features/workout-session/model/workout-session.store";
import { useWorkoutBuilderStore } from "@/features/workout-builder/model/workout-builder.store";
import { WorkoutSessionList } from "@/features/workout-session/ui/workout-session-list";
import { WorkoutSessionHeader } from "@/features/workout-session/ui/workout-session-header";
import { EmbedFlowConfirm } from "@/shared/ui/embed-flow-confirm";
import { useI18n } from "locales/client";

const exercise = { id: "ex-1", name: "Squat", nameEn: "Squat", attributes: [] };

function App() {
  const isWorkoutActive = useWorkoutSessionStore((state) => state.isWorkoutActive);
  const exercisesCompleted = useWorkoutSessionStore((state) => state.exercisesCompleted);
  const currentStep = useWorkoutBuilderStore((state) => state.currentStep);
  const sessionId = useWorkoutSessionStore((state) => state.session?.id ?? "");

  useEffect(() => {
    const post = () => {
      window.parent.postMessage({ type: "wc:height", height: document.documentElement.scrollHeight }, "*");
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    document.documentElement.setAttribute("data-wc-ready", "1");
    window.__wcSessionStore = useWorkoutSessionStore;
    window.__wcMarkProgress = () => useWorkoutSessionStore.getState().finishSet(0, 0);
    return () => observer.disconnect();
  }, [isWorkoutActive, exercisesCompleted]);

  const start = () => {
    useWorkoutBuilderStore.getState().setStep(3);
    useWorkoutSessionStore.getState().startWorkout([exercise], [], []);
  };

  return (
    <div
      data-wc-active={isWorkoutActive ? "1" : "0"}
      data-wc-completed={String(exercisesCompleted)}
      data-wc-session={sessionId}
      data-wc-step={String(currentStep)}
    >
      {isWorkoutActive ? (
        <WorkoutSessionHeader onQuitWorkout={() => useWorkoutSessionStore.getState().quitWorkout()} />
      ) : (
        <button type="button" onClick={start}>Start workout</button>
      )}
      <div style={{ height: 2400 }} />
    </div>
  );
}

function DeletePreview() {
  const t = useI18n();
  useEffect(() => {
    const post = () => {
      window.parent.postMessage({ type: "wc:height", height: document.documentElement.scrollHeight }, "*");
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    document.documentElement.setAttribute("data-wc-ready", "1");
    return () => observer.disconnect();
  }, []);
  return (
    <div>
      <EmbedFlowConfirm
        body={t("workout_builder.confirm_delete")}
        cancelLabel={t("commons.cancel")}
        confirmLabel={t("workout_builder.session.delete")}
        marker="delete"
        onCancel={() => {}}
        onConfirm={() => {}}
        title={t("workout_builder.session.delete_workout_title")}
      />
      <div style={{ height: 2400 }} />
    </div>
  );
}

function HistoryHarness() {
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    const post = () => {
      window.parent.postMessage({ type: "wc:height", height: document.documentElement.scrollHeight }, "*");
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    window.__wcRemoveCalls = 0;
    window.__wcUnmountHistoryList = () => setMounted(false);
    const timer = setTimeout(() => document.documentElement.setAttribute("data-wc-ready", "1"), 0);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  return (
    <div>
      {mounted ? <WorkoutSessionList /> : <div data-wc-list-unmounted="" />}
      <div style={{ height: 2400 }} />
    </div>
  );
}

const card = new URLSearchParams(location.search).get("card");
if (card === "history") {
  window.__wcSessions = [{
    id: "hist-1",
    status: "completed",
    startedAt: "2026-01-02T15:04:00.000Z",
    endedAt: "2026-01-02T16:00:00.000Z",
    muscles: [],
    exercises: [{ id: "ex-1", name: "Squat", nameEn: "Squat", order: 0, attributes: [] }]
  }, {
    id: "hist-2",
    status: "completed",
    startedAt: "2026-01-03T15:04:00.000Z",
    endedAt: "2026-01-03T16:00:00.000Z",
    muscles: [],
    exercises: [{ id: "ex-2", name: "Lunge", nameEn: "Lunge", order: 0, attributes: [] }]
  }];
}
createRoot(document.getElementById("root")).render(
  card === "delete" ? <DeletePreview /> : card === "history" ? <HistoryHarness /> : <App />
);
`,
  );

  const esbuild = loadEsbuild();
  const srcRoot = join(process.cwd(), "src");
  return esbuild.build({
    absWorkingDir: process.cwd(),
    nodePaths: [join(process.cwd(), "node_modules")],
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    outfile: join(dir, "harness.js"),
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "wc-harness",
        setup(build) {
          build.onResolve({ filter: /^locales\/client$/ }, () => ({ path: i18nStub }));
          build.onResolve({ filter: /^@prisma\/client$/ }, () => ({ path: prismaStub }));
          build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: navigationStub }));
          build.onResolve({ filter: /^next\/link$/ }, () => ({ path: linkStub }));
          build.onResolve({ filter: /^@\/features\/workout-session\/model\/use-workout-sessions$/ }, () => ({ path: sessionsStub }));
          build.onResolve({ filter: /^@\/shared\/lib\/workout-session\/use-workout-session\.service$/ }, () => ({
            path: serviceStub,
          }));
          build.onResolve({ filter: /^server-only$/ }, () => ({ path: prismaStub }));
          build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "css-empty" }));
          build.onLoad({ filter: /.*/, namespace: "css-empty" }, () => ({ contents: "", loader: "js" }));
          build.onResolve({ filter: /^@\// }, (args) => {
            const rel = args.path.slice(2);
            if (rel === "features/workout-builder/model/workout-builder.store") return { path: builderStub };
            const base = join(srcRoot, rel);
            const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
            const found = candidates.find((candidate) => existsSync(candidate));
            return { path: found || base };
          });
        },
      },
    ],
  });
}

function harnessHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>quit harness</title>
<script>
  const query = new URLSearchParams(location.search);
  if (query.get("embed") === "1") document.documentElement.setAttribute("data-wc-embed", "1");
  if (query.get("dark") === "1") document.documentElement.classList.add("dark");
</script>
<link rel="stylesheet" href="/app.css">
<style>
  html[data-wc-embed="1"], html[data-wc-embed="1"] body { height: auto !important; overflow: hidden !important; margin: 0; }
  body { margin: 0; }
</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
}

function probeHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>modal probe</title>
<script>document.documentElement.setAttribute("data-wc-embed","1");</script>
<style>
  html, body { margin: 0; height: auto; overflow: hidden; }
  .fixed-box { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 280px; height: 160px; background: white; }
  .daisy { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; }
  .daisy.open { display: flex; }
  .daisy-box { width: 280px; height: 180px; background: white; }
  .spacer { height: 2400px; }
</style></head><body>
<button id="open-fixed" type="button">Open fixed</button>
<button id="open-dialog" type="button">Open dialog</button>
<button id="open-daisy" type="button">Open daisy</button>
<div id="fixed" class="fixed-box" hidden data-probe="fixed">fixed center</div>
<dialog id="native" data-probe="dialog"><p>Native dialog</p></dialog>
<div id="daisy" class="daisy" data-probe="daisy"><div class="daisy-box">daisy center</div></div>
<div class="spacer"></div>
<script>
  const post = () => parent.postMessage({ type: "wc:height", height: document.documentElement.scrollHeight }, "*");
  post();
  document.getElementById("open-fixed").onclick = () => { document.getElementById("fixed").hidden = false; post(); };
  document.getElementById("open-dialog").onclick = () => { document.getElementById("native").showModal(); post(); };
  document.getElementById("open-daisy").onclick = () => { document.getElementById("daisy").classList.add("open"); post(); };
</script></body></html>`;
}

function startMappedServer(port, files) {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/phone") {
      const src = url.searchParams.get("src") || "";
      const dark = src.includes("dark=1");
      const background = dark ? "#0b0f14" : "#f6f3ec";
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(
        `<!doctype html><html><head><meta charset="utf-8"><title>phone</title><style>
          html,body{margin:0;background:${background}}
          #phone{width:390px;height:844px;overflow:hidden}
          iframe{width:390px;border:0;height:844px;display:block;background:${background}}
        </style></head><body><div id="phone"><iframe id="child" name="child" title="workout" src="${src}"></iframe></div>
        <script>
          window.addEventListener("message", (event) => {
            const data = event.data;
            if (!data || data.type !== "wc:height") return;
            const frame = document.getElementById("child");
            const height = Math.max(844, Number(data.height) || 844);
            frame.style.height = height + "px";
          });
        </script></body></html>`,
      );
      return;
    }
    const file = files.get(url.pathname);
    if (!file) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
      return;
    }
    response.writeHead(200, { "content-type": file.type, "cache-control": "no-store" });
    response.end(file.body);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function parseColor(value) {
  const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}

function contrastRatio(foreground, background) {
  const linear = (amount) => {
    const unit = amount / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (channels) => 0.2126 * linear(channels[0]) + 0.7152 * linear(channels[1]) + 0.0722 * linear(channels[2]);
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

async function assertInPhone(page, frame, selector) {
  const phone = await page.locator("#phone").boundingBox();
  const card = await frame.locator(selector).boundingBox();
  if (!phone || !card) throw new Error(`${selector} has no box`);
  const bottom = card.y + card.height;
  if (card.y < phone.y - 1 || bottom > phone.y + phone.height + 1) {
    throw new Error(`${selector} outside the 390x844 phone (y=${card.y}, bottom=${bottom}, phone=${phone.height})`);
  }
}

async function assertDesign(frame) {
  const sample = await frame.locator("[data-wc-quit-confirm]").evaluate((root) => {
    const read = (element) => {
      let node = element;
      let background = getComputedStyle(node).backgroundColor;
      while (node && (background === "transparent" || background === "rgba(0, 0, 0, 0)")) {
        node = node.parentElement;
        background = node ? getComputedStyle(node).backgroundColor : background;
      }
      const style = getComputedStyle(element);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        height: element.getBoundingClientRect().height,
        color: style.color,
        background,
      };
    };
    return {
      title: read(root.querySelector("h3")),
      body: read(root.querySelector("p")),
      buttons: [...root.querySelectorAll("button")].map(read),
    };
  });
  for (const part of [sample.title, sample.body, ...sample.buttons]) {
    if (part.fontSize < 18) throw new Error(`confirm text is ${part.fontSize}px`);
    const foreground = parseColor(part.color);
    const background = parseColor(part.background);
    if (!foreground || !background) throw new Error(`unreadable color ${part.color} on ${part.background}`);
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) throw new Error(`contrast ${ratio.toFixed(2)} for ${part.color} on ${part.background}`);
  }
  for (const button of sample.buttons) {
    if (button.height < 48) throw new Error(`confirm target is ${button.height}px`);
  }
}

async function storedSession(frame) {
  return frame.evaluate(() => ({
    current: localStorage.getItem("currentWorkoutSessionId"),
    sessions: JSON.parse(localStorage.getItem("workoutSessions") || "[]"),
  }));
}

async function attachChildFrame(page) {
  const element = await page.waitForSelector("iframe[name=child]");
  let frame = await element.contentFrame();
  const started = Date.now();
  while (!frame && Date.now() - started < 5000) {
    await page.waitForTimeout(50);
    frame = await element.contentFrame();
  }
  if (!frame) throw new Error("quit iframe did not attach");
  return frame;
}

async function openPhone(browser, parentOrigin, childOrigin, search) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(arg) {
      if (arg && arg.block === "center") window.__wcScrolled = true;
      return original.call(this, arg);
    };
  });
  const src = `${childOrigin}/harness.html${search}`;
  await page.goto(`${parentOrigin}/phone?src=${encodeURIComponent(src)}`, { waitUntil: "domcontentloaded" });
  const frame = await attachChildFrame(page);
  await frame.waitForSelector("[data-wc-ready]");
  await page.waitForFunction(() => {
    const iframe = document.querySelector("#child");
    return iframe && Number.parseInt(iframe.style.height, 10) > 1200;
  });
  if (!frame.url().includes(childOrigin) || page.url().includes(childOrigin)) {
    throw new Error(`quit parent and child are not cross-origin (${page.url()} / ${frame.url()})`);
  }
  return { page, frame };
}

async function focusedName(target) {
  return target.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return "";
    return (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim();
  });
}

async function armNonFocusingClick(button) {
  await button.evaluate((element) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    element.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();
      },
      { capture: true, once: true },
    );
    element.addEventListener(
      "click",
      () => {
        element.blur();
      },
      { capture: true, once: true },
    );
  });
}

async function installDisableTimerSpy(frame) {
  await frame.evaluate(() => {
    window.__wcDisableTimer = { set: 0, cleared: 0, fired: 0 };
    window.__wcUnmountStateErrors = 0;
    const tracked = new Set();
    const set = window.setTimeout.bind(window);
    const clear = window.clearTimeout.bind(window);
    const report = console.error.bind(console);
    console.error = (...args) => {
      const text = args.map((item) => (typeof item === "string" ? item : item instanceof Error ? item.message : "")).join(" ");
      if (text.includes("unmounted") || text.includes("Can't perform a React state update")) window.__wcUnmountStateErrors += 1;
      return report(...args);
    };
    window.setTimeout = (fn, delay, ...args) => {
      const source = typeof fn === "function" ? fn.toString() : "";
      const watched = source.includes("setIsConfirming") || source.includes("setIsDeleting");
      const id = set(() => {
        if (tracked.delete(id)) window.__wcDisableTimer.fired += 1;
        if (typeof fn === "function") return fn(...args);
      }, delay);
      if (watched) {
        tracked.add(id);
        window.__wcDisableTimer.set += 1;
      }
      return id;
    };
    window.clearTimeout = (id) => {
      if (tracked.delete(id)) window.__wcDisableTimer.cleared += 1;
      return clear(id);
    };
  });
}

async function assertDisableTimerCleared(frame, label) {
  await frame.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 50)));
  const stats = await frame.evaluate(() => ({ ...window.__wcDisableTimer, errors: window.__wcUnmountStateErrors || 0 }));
  if (!stats || stats.set < 1) throw new Error(`${label} did not schedule a disable timer`);
  if (stats.fired !== 0 || stats.errors !== 0) {
    throw new Error(`${label} setState after unmount (fired ${stats.fired}, console ${stats.errors})`);
  }
  if (stats.cleared < 1) throw new Error(`${label} left a pending disable timer`);
}

async function assertDisabledSoon(button, label) {
  const deadline = Date.now() + 1000;
  while (!(await button.isDisabled())) {
    if (Date.now() > deadline) throw new Error(`${label} was not disabled`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

async function installListenerSpy(frame) {
  await frame.evaluate(() => {
    window.__wcKeydown = 0;
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, listener, options) => {
      if (type === "keydown") window.__wcKeydown += 1;
      return add(type, listener, options);
    };
    document.removeEventListener = (type, listener, options) => {
      if (type === "keydown") window.__wcKeydown -= 1;
      return remove(type, listener, options);
    };
  });
}

async function runQuitEmbedHarness(browser) {
  const quitLabel = localeValue("quit_workout");
  const title = localeValue("embed_quit_title");
  const keepLabel = localeValue("embed_quit_cancel");
  const discardLabel = localeValue("embed_quit_confirm");
  const dir = join(tmpdir(), `wc-quit-harness-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  let child;
  let parent;
  try {
    await bundleQuitHarness(dir);
    const css = builtStyles();
    const childPort = await unusedPort();
    const parentPort = await unusedPort();
    const files = new Map([
      ["/harness.js", { type: "text/javascript; charset=utf-8", body: readFileSync(join(dir, "harness.js")) }],
      ["/app.css", { type: "text/css; charset=utf-8", body: css }],
      ["/harness.html", { type: "text/html; charset=utf-8", body: harnessHtml() }],
      ["/probe.html", { type: "text/html; charset=utf-8", body: probeHtml() }],
    ]);
    child = await startMappedServer(childPort, files);
    parent = await startMappedServer(parentPort, files);
    const childOrigin = `http://127.0.0.1:${childPort}`;
    const parentOrigin = `http://127.0.0.1:${parentPort}`;
    const shotDir = process.env.WC_EMBED_SHOT_DIR || "";

    async function saveShot(page, name) {
      if (!shotDir) return;
      mkdirSync(shotDir, { recursive: true });
      await page.locator("#phone").screenshot({ path: join(shotDir, name) });
    }

    const light = await openPhone(browser, parentOrigin, childOrigin, "?embed=1");
    await light.frame.getByRole("button", { name: "Start workout" }).click();
    await light.frame.locator("[data-wc-step='3']").waitFor();
    await light.frame.locator("[data-wc-active='1']").waitFor();
    await light.frame.evaluate(() => window.__wcMarkProgress());
    await light.frame.locator("[data-wc-completed='1']").waitFor();
    const keptId = await light.frame.locator("[data-wc-session]").getAttribute("data-wc-session");
    await installListenerSpy(light.frame);
    await light.frame.evaluate(() => {
      const store = window.__wcSessionStore;
      window.__wcCompleteCalls = 0;
      const original = store.getState().completeWorkout;
      store.setState({
        completeWorkout: () => {
          window.__wcCompleteCalls += 1;
          return original();
        },
      });
    });
    const keydownBefore = await light.frame.evaluate(() => window.__wcKeydown);
    await light.frame.getByRole("button", { name: quitLabel }).click();
    await light.frame.getByRole("dialog", { name: title }).waitFor();
    const keydownDuring = await light.frame.evaluate(() => window.__wcKeydown);
    if (keydownDuring !== keydownBefore + 1) throw new Error(`keydown listeners ${keydownDuring} from ${keydownBefore}`);
    const scrolled = await light.frame.evaluate(() => window.__wcScrolled === true);
    if (!scrolled) throw new Error("confirm did not scrollIntoView({block:'center'})");
    const openedFocus = await light.frame.evaluate(() => {
      const element = document.activeElement;
      return {
        tag: element?.tagName || "",
        tab: element?.getAttribute("tabindex") || "",
        text: (element?.textContent || "").replace(/\s+/g, " ").trim(),
      };
    });
    if (openedFocus.tag !== "H3" || openedFocus.tab !== "-1" || openedFocus.text !== title) {
      throw new Error(`focused ${openedFocus.tag} ${openedFocus.text}`);
    }
    await light.frame.locator("[data-wc-quit-confirm] h3").press("Tab");
    if ((await focusedName(light.frame)) !== discardLabel) {
      throw new Error(`Tab from title left focus on ${await focusedName(light.frame)}`);
    }
    await light.frame.getByRole("button", { name: discardLabel }).press("Tab");
    if ((await focusedName(light.frame)) !== keepLabel) {
      throw new Error(`Tab from confirm left focus on ${await focusedName(light.frame)}`);
    }
    await light.frame.getByRole("button", { name: keepLabel }).press("Tab");
    if ((await focusedName(light.frame)) !== discardLabel) {
      throw new Error(`Tab wrap left focus on ${await focusedName(light.frame)}`);
    }
    await light.frame.getByRole("button", { name: discardLabel }).press("Shift+Tab");
    if ((await focusedName(light.frame)) !== keepLabel) {
      throw new Error(`Shift+Tab wrap left focus on ${await focusedName(light.frame)}`);
    }
    const described = await light.frame.locator("[data-wc-quit-confirm]").evaluate((element) => {
      const id = element.getAttribute("aria-describedby");
      return id ? (document.getElementById(id)?.textContent?.trim() ?? "") : "";
    });
    if (described !== localeValue("embed_quit_warning")) throw new Error(`quit describedby ${described}`);
    await assertInPhone(light.page, light.frame, "[data-wc-quit-confirm]");
    await assertDesign(light.frame);
    await saveShot(light.page, "confirm-390-light.png");
    await light.frame.getByRole("button", { name: keepLabel }).click();
    if ((await focusedName(light.frame)).includes(quitLabel) === false) {
      throw new Error(`Keep going left focus on ${await focusedName(light.frame)}`);
    }
    if ((await light.frame.locator("[data-wc-quit-confirm]").count()) !== 0) throw new Error("Keep going left the confirm open");
    const keydownAfter = await light.frame.evaluate(() => window.__wcKeydown);
    if (keydownAfter !== keydownBefore) throw new Error(`Escape listener leaked (${keydownAfter} vs ${keydownBefore})`);
    await light.frame.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    if ((await light.frame.locator("[data-wc-active]").getAttribute("data-wc-active")) !== "1") {
      throw new Error("Escape after unmount ended the session");
    }
    if ((await light.frame.locator("[data-wc-session]").getAttribute("data-wc-session")) !== keptId) {
      throw new Error("Keep going replaced the session");
    }
    const keptStore = await storedSession(light.frame);
    if (keptStore.current !== keptId) throw new Error("Keep going cleared the current session");
    if (!keptStore.sessions.some((session) => session.id === keptId && session.status === "active")) {
      throw new Error("Keep going did not keep the active session");
    }
    await light.frame.getByRole("button", { name: quitLabel }).click();
    await light.frame.locator("[data-wc-quit-confirm]").waitFor();
    await light.frame.locator("[data-wc-quit-confirm]").press("Escape");
    if ((await light.frame.locator("[data-wc-quit-confirm]").count()) !== 0) throw new Error("Escape left the confirm open");
    if ((await light.frame.locator("[data-wc-active]").getAttribute("data-wc-active")) !== "1") throw new Error("Escape ended the session");
    if ((await focusedName(light.frame)).includes(quitLabel) === false) {
      throw new Error(`Escape left focus on ${await focusedName(light.frame)}`);
    }
    const quitTrigger = light.frame.getByRole("button", { name: quitLabel });
    await armNonFocusingClick(quitTrigger);
    await quitTrigger.click();
    await light.frame.locator("[data-wc-quit-confirm]").waitFor();
    await light.frame.getByRole("button", { name: keepLabel }).click();
    if ((await focusedName(light.frame)).includes(quitLabel) === false) {
      throw new Error(`non-focusing Keep going left focus on ${await focusedName(light.frame)}`);
    }
    await light.frame.evaluate(() => {
      const store = window.__wcSessionStore;
      const original = store.getState().quitWorkout;
      window.__wcOriginalQuit = original;
      window.__wcHoldQuit = true;
      window.__wcQuitCalls = 0;
      store.setState({
        quitWorkout: () => {
          window.__wcQuitCalls += 1;
          if (window.__wcHoldQuit) throw new Error("hold");
          return original();
        },
      });
    });
    await quitTrigger.click();
    await assertInPhone(light.page, light.frame, "[data-wc-quit-confirm]");
    const quitConfirm = light.frame.getByRole("button", { name: discardLabel });
    await quitConfirm.dblclick();
    const quitCalls = await light.frame.evaluate(() => window.__wcQuitCalls || 0);
    if (quitCalls !== 1) throw new Error(`quit confirm ran ${quitCalls} times`);
    await light.frame.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 50)));
    if (await quitConfirm.isDisabled()) throw new Error("quit confirm stayed disabled after a failed quit");
    await quitConfirm.click();
    const retried = await light.frame.evaluate(() => window.__wcQuitCalls || 0);
    if (retried !== 2) throw new Error(`throwing quit was not clickable again (${retried})`);
    await light.frame.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 50)));
    if (await quitConfirm.isDisabled()) throw new Error("quit confirm stayed disabled after retry");
    await light.frame.evaluate(() => {
      window.__wcHoldQuit = false;
      window.__wcOriginalQuit();
    });
    if ((await light.frame.evaluate(() => window.__wcCompleteCalls || 0)) !== 0) {
      throw new Error(`quit called completeWorkout ${await light.frame.evaluate(() => window.__wcCompleteCalls || 0)} times`);
    }
    await light.frame.locator("[data-wc-active='0']").waitFor();
    await light.frame.locator("[data-wc-step='1']").waitFor();
    await light.frame.locator("[data-wc-completed='0']").waitFor();
    const cleared = await storedSession(light.frame);
    if (cleared.current !== null) throw new Error("current-session key remains after quit");
    if (cleared.sessions.some((session) => session.status === "completed" || session.id === keptId)) {
      throw new Error("quit left a completed or stale session");
    }
    await light.frame.getByRole("button", { name: "Start workout" }).click();
    await light.frame.locator("[data-wc-active='1']").waitFor();
    const nextId = await light.frame.locator("[data-wc-session]").getAttribute("data-wc-session");
    const nextCompleted = await light.frame.locator("[data-wc-completed]").getAttribute("data-wc-completed");
    const nextStore = await storedSession(light.frame);
    const nextSet = nextStore.sessions[0]?.exercises?.[0]?.sets?.[0]?.completed;
    if (!nextId || nextId === keptId) throw new Error("next workout reused the quit session");
    if (nextCompleted !== "0" || nextSet !== false) throw new Error("next workout kept stale progress");
    if (nextStore.current !== nextId) throw new Error("next workout did not become the current session");
    if (nextStore.sessions.some((session) => session.status === "completed")) throw new Error("next workout stored a completed session");
    await installDisableTimerSpy(light.frame);
    await light.frame.getByRole("button", { name: quitLabel }).click();
    await light.frame.locator("[data-wc-quit-confirm]").waitFor();
    await light.frame.getByRole("button", { name: discardLabel }).click();
    await light.frame.locator("[data-wc-active='0']").waitFor();
    await assertDisableTimerCleared(light.frame, "quit confirm");
    await light.page.close();

    const dark = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&dark=1");
    await dark.frame.evaluate(() => localStorage.clear());
    await dark.frame.getByRole("button", { name: "Start workout" }).click();
    await dark.frame.getByRole("button", { name: quitLabel }).click();
    await dark.frame.getByRole("dialog", { name: title }).waitFor();
    await assertInPhone(dark.page, dark.frame, "[data-wc-quit-confirm]");
    await assertDesign(dark.frame);
    await saveShot(dark.page, "confirm-390-dark.png");
    await dark.page.close();

    const deleteTitle = localeValue("delete_workout_title");
    const deleteLight = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&card=delete");
    await deleteLight.frame.getByRole("dialog", { name: deleteTitle }).waitFor();
    await assertInPhone(deleteLight.page, deleteLight.frame, "[data-wc-delete-confirm]");
    await saveShot(deleteLight.page, "delete-390-light.png");
    await deleteLight.page.close();
    const deleteDark = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&dark=1&card=delete");
    await deleteDark.frame.getByRole("dialog", { name: deleteTitle }).waitFor();
    await assertInPhone(deleteDark.page, deleteDark.frame, "[data-wc-delete-confirm]");
    await saveShot(deleteDark.page, "delete-390-dark.png");
    await deleteDark.page.close();

    const plain = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await plain.goto(`${childOrigin}/harness.html`, { waitUntil: "domcontentloaded" });
    await plain.evaluate(() => localStorage.clear());
    await plain.reload({ waitUntil: "domcontentloaded" });
    await plain.waitForSelector("[data-wc-ready]");
    await plain.getByRole("button", { name: "Start workout" }).click();
    await plain.getByRole("button", { name: quitLabel }).click();
    const radix = plain.getByRole("dialog");
    await radix.waitFor();
    const desktopCopy = await radix.innerText();
    for (const expected of [
      "Quit Workout?",
      "Are you sure you want to quit? You can save your progress or lose it completely.",
      "Quit Without Saving",
      "Continue Workout",
    ]) {
      if (!desktopCopy.includes(expected)) throw new Error(`non-embed dialog missing ${expected}`);
    }
    if ((await plain.locator("[data-wc-quit-confirm]").count()) !== 0) throw new Error("non-embed rendered the in-flow confirm");
    const position = await radix.evaluate((element) => getComputedStyle(element).position);
    if (position !== "fixed") throw new Error(`non-embed dialog position ${position}`);
    await plain.evaluate(() => {
      const dialog = document.querySelector("[role=dialog]");
      window.__wcDialogClose = new Promise((resolve) => {
        const obs = new MutationObserver(() => {
          if (dialog.getAttribute("data-state") === "closed") {
            obs.disconnect();
            resolve("closed");
            return;
          }
          if (!dialog.isConnected) {
            obs.disconnect();
            resolve("removed");
          }
        });
        obs.observe(document.body, { attributes: true, subtree: true, childList: true });
        setTimeout(() => {
          obs.disconnect();
          resolve(dialog.isConnected ? "still-open" : "removed");
        }, 1000);
      });
    });
    await plain.keyboard.press("Escape");
    const closeState = await plain.evaluate(() => window.__wcDialogClose);
    if (closeState !== "closed") throw new Error(`non-embed dialog ${closeState} instead of staying mounted closed`);
    await plain.getByRole("dialog").waitFor({ state: "hidden" });
    if ((await focusedName(plain)).includes(quitLabel) === false) {
      throw new Error(`non-embed Escape left focus on ${await focusedName(plain)}`);
    }
    if ((await plain.locator("[data-wc-active]").getAttribute("data-wc-active")) !== "1") {
      throw new Error("non-embed Escape ended the session");
    }
    if ((await plain.locator("[data-wc-quit-confirm]").count()) !== 0) throw new Error("non-embed Escape rendered the in-flow confirm");
    await plain.getByRole("button", { name: quitLabel }).click();
    await plain.getByRole("dialog").waitFor();
    await plain.locator(".fixed.inset-0").click({ position: { x: 8, y: 8 } });
    await plain.getByRole("dialog").waitFor({ state: "hidden" });
    if ((await focusedName(plain)).includes(quitLabel) === false) {
      throw new Error(`overlay click left focus on ${await focusedName(plain)}`);
    }
    if ((await plain.locator("[data-wc-active]").getAttribute("data-wc-active")) !== "1") {
      throw new Error("overlay click ended the session");
    }
    await plain.getByRole("button", { name: quitLabel }).click();
    await plain.getByRole("button", { name: localeValue("continue_workout") }).click();
    if ((await plain.locator("[data-wc-active]").getAttribute("data-wc-active")) !== "1") {
      throw new Error("non-embed Keep going ended the session");
    }
    await plain.close();

    const deleteLabel = localeValue("delete");
    const cancelLabel = localeValue("cancel");
    const history = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&card=history");
    history.page.on("dialog", (dialog) => dialog.dismiss());
    const historyDelete = history.frame.locator("ul").getByRole("button", { name: deleteLabel }).first();
    await historyDelete.click();
    if ((await history.frame.evaluate(() => window.__wcRemoveCalls || 0)) !== 0) {
      throw new Error("embed delete called removeSession before confirm");
    }
    await history.frame.getByRole("dialog", { name: deleteTitle }).waitFor();
    await assertInPhone(history.page, history.frame, "[data-wc-delete-confirm]");
    await history.frame.getByRole("button", { name: cancelLabel }).click();
    if ((await history.frame.locator("[data-wc-delete-confirm]").count()) !== 0) throw new Error("Cancel left the delete card open");
    if ((await focusedName(history.frame)) !== deleteLabel) {
      throw new Error(`Cancel left focus on ${await focusedName(history.frame)}`);
    }
    await historyDelete.click();
    await history.frame.locator("[data-wc-delete-confirm]").press("Escape");
    if ((await history.frame.locator("[data-wc-delete-confirm]").count()) !== 0) throw new Error("Escape left the delete card open");
    if ((await focusedName(history.frame)) !== deleteLabel) {
      throw new Error(`delete Escape left focus on ${await focusedName(history.frame)}`);
    }
    if ((await history.frame.evaluate(() => window.__wcRemoveCalls || 0)) !== 0) {
      throw new Error("closing the delete card called removeSession");
    }
    await armNonFocusingClick(historyDelete);
    await historyDelete.click();
    await history.frame.locator("[data-wc-delete-confirm]").waitFor();
    await history.frame.getByRole("button", { name: cancelLabel }).click();
    if ((await focusedName(history.frame)) !== deleteLabel) {
      throw new Error(`non-focusing Cancel left focus on ${await focusedName(history.frame)}`);
    }
    await historyDelete.click();
    await history.frame.locator("[data-wc-delete-confirm]").waitFor();
    await history.frame.evaluate(() => {
      let resolveHold;
      const gate = new Promise((resolve) => {
        resolveHold = resolve;
      });
      window.__wcHoldRemove = () => gate;
      window.__wcReleaseRemove = () => resolveHold();
    });
    const deleteConfirm = history.frame.locator("[data-wc-delete-confirm]").getByRole("button", { name: deleteLabel });
    await deleteConfirm.dblclick();
    const removeCalls = await history.frame.evaluate(() => window.__wcRemoveCalls || 0);
    if (removeCalls !== 1) throw new Error(`removeSession ran ${removeCalls} times`);
    await assertDisabledSoon(deleteConfirm, "delete confirm");
    await history.frame.evaluate(() => window.__wcReleaseRemove());
    try {
      await history.frame.waitForFunction((label) => {
        if (document.querySelectorAll("ul li").length !== 1) return false;
        const element = document.activeElement;
        if (!element || element === document.body) return false;
        const name = (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim();
        return name === label;
      }, deleteLabel);
    } catch (error) {
      throw new Error(`delete left focus on ${await focusedName(history.frame)} (${error.message})`);
    }
    await historyDelete.click();
    await history.frame.locator("[data-wc-delete-confirm]").getByRole("button", { name: deleteLabel }).click();
    try {
      await history.frame.waitForFunction(() => {
        if (document.querySelectorAll("ul li").length !== 0) return false;
        const element = document.activeElement;
        return element?.tagName === "H2" && element.getAttribute("tabindex") === "-1";
      });
    } catch (error) {
      const headingFocus = await history.frame.evaluate(() => document.activeElement?.tagName || "");
      throw new Error(`last delete left focus on ${headingFocus} (${error.message})`);
    }
    await history.page.close();

    const historyUnmount = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&card=history");
    historyUnmount.page.on("dialog", (dialog) => dialog.dismiss());
    await installDisableTimerSpy(historyUnmount.frame);
    await historyUnmount.frame.evaluate(() => {
      window.__wcHoldRemove = () => new Promise(() => {});
      const onClick = (event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest("[data-wc-delete-confirm]")) return;
        document.removeEventListener("click", onClick, false);
        queueMicrotask(() => window.__wcUnmountHistoryList?.());
      };
      document.addEventListener("click", onClick, false);
    });
    await historyUnmount.frame.locator("ul").getByRole("button", { name: deleteLabel }).first().click();
    await historyUnmount.frame.locator("[data-wc-delete-confirm]").getByRole("button", { name: deleteLabel }).click();
    await historyUnmount.frame.locator("[data-wc-list-unmounted]").waitFor({ state: "attached" });
    await assertDisableTimerCleared(historyUnmount.frame, "delete confirm");
    await historyUnmount.page.close();

    const historyPlain = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    historyPlain.on("dialog", (dialog) => dialog.dismiss());
    await historyPlain.goto(`${childOrigin}/harness.html?card=history`, { waitUntil: "domcontentloaded" });
    await historyPlain.waitForSelector("[data-wc-ready]");
    await historyPlain.locator("ul").getByRole("button", { name: deleteLabel }).first().click();
    if ((await historyPlain.locator("[data-wc-delete-confirm]").count()) !== 0) {
      throw new Error("non-embed delete rendered the in-flow card");
    }
    if ((await historyPlain.evaluate(() => window.__wcRemoveCalls || 0)) !== 0) {
      throw new Error("dismissed confirm called removeSession");
    }
    await historyPlain.close();

    const probePage = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await probePage.goto(`${parentOrigin}/phone?src=${encodeURIComponent(`${childOrigin}/probe.html`)}`, {
      waitUntil: "domcontentloaded",
    });
    const probe = await attachChildFrame(probePage);
    await probePage.waitForFunction(() => {
      const iframe = document.querySelector("#child");
      return iframe && Number.parseInt(iframe.style.height, 10) > 1200;
    });
    const phone = await probePage.locator("#phone").boundingBox();
    const measured = await probe.evaluate(() => {
      const boxOf = (element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, height: box.height, center: box.top + box.height / 2 };
      };
      document.getElementById("open-fixed").click();
      const fixed = boxOf(document.querySelector("[data-probe='fixed']"));
      document.getElementById("fixed").hidden = true;
      document.getElementById("open-dialog").click();
      const dialog = boxOf(document.querySelector("[data-probe='dialog']"));
      const dialogText = boxOf(document.querySelector("[data-probe='dialog'] p"));
      document.getElementById("native").close();
      document.getElementById("open-daisy").click();
      const daisy = boxOf(document.querySelector(".daisy-box"));
      return { fixed, dialog, dialogText, daisy, iframeHeight: window.innerHeight };
    });
    const probes = Object.entries(measured)
      .filter((entry) => entry[0] !== "iframeHeight")
      .map(([kind, box]) => ({
        kind,
        top: box.top,
        height: box.height,
        center: box.center,
        offScreen: Boolean(phone && box.center > phone.y + phone.height),
      }));
    probes.push({ kind: "iframeHeight", height: measured.iframeHeight });
    console.log(`QUIT_PROBES ${JSON.stringify(probes)}`);
    await probePage.close();
    console.log("embed iframe: quit confirm stays in the 390x844 frame and quit clears the session");
  } finally {
    if (parent) await closeServer(parent);
    if (child) await closeServer(child);
    rmSync(dir, { recursive: true, force: true });
  }
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
    stdio: ["ignore", "pipe", "pipe"],
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
    const frameUrls = page
      .frames()
      .map((frame) => frame.url())
      .join(" ");
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
    await runQuitEmbedHarness(browser);
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
