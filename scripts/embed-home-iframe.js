/**
 * Cross-origin iframe check for the signed-out embed home.
 *
 * A parent on another localhost port frames /en/?embed=1 and /en?embed=1 with no
 * cookie. Production frame-ancestors does not allow that parent. This script's
 * forwarder copies the browser request and appends only that parent origin on
 * the way back. The app, next.config.ts, and FRAME_ANCESTORS_CSP stay unchanged.
 *
 * Requires `pnpm build` and Playwright's Chromium (`pnpm exec playwright install chromium`).
 * The title modality check also runs in WebKit when that binary is installed.
 * A throwing-quit double-click also runs in Firefox when that binary is installed.
 * In CI, a missing Chromium or WebKit fails the run. A missing Firefox skips.
 */
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { createServer: createNetServer } = require("node:net");
const { createServer, request: httpRequest } = require("node:http");
const { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } = require("node:fs");
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

function assertTrapUsesFocusVisible() {
  const source = readFileSync(join(process.cwd(), "src/shared/ui/embed-flow-confirm.tsx"), "utf8");
  const trapStart = source.indexOf('if (event.key !== "Tab")');
  const trapEnd = source.indexOf('document.addEventListener("keydown", onKeyDown)');
  const trap = source.slice(trapStart, trapEnd);
  const forward = trap.includes("first.focus({ focusVisible: true }");
  const backward = trap.includes("last.focus({ focusVisible: true }");
  if (!forward || !backward || /(?:first|last)\.focus\(\)/.test(trap)) {
    throw new Error("tab trap focus is missing focusVisible");
  }
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

function readQuitGuardMs() {
  const source = readFileSync(join(process.cwd(), "src/features/workout-builder/ui/quit-workout-dialog.tsx"), "utf8");
  const match = source.match(/const DOUBLE_ACTIVATION_GUARD_MS = (\d+);/);
  if (!match) throw new Error("DOUBLE_ACTIVATION_GUARD_MS is missing from the quit dialog");
  return Number(match[1]);
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
    "programs.start_session": localeValue("start_session"),
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
  window.__wcRefetchSessions = () => setData((window.__wcSessions || []).slice());
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
    if (window.__wcFailRemove) throw new Error("delete failed");
    window.__wcSessions = (window.__wcSessions || []).filter((session) => session.id !== id);
    workoutSessionLocal.remove(id);
  }
});
`,
  );
  const imageStub = join(dir, "image-stub.jsx");
  const headersStub = join(dir, "headers-stub.js");
  const cacheStub = join(dir, "cache-stub.js");
  const confettiStub = join(dir, "confetti-stub.js");
  const envStub = join(dir, "env-stub.js");
  const prismaLibStub = join(dir, "prisma-lib-stub.js");
  const authClientStub = join(dir, "auth-client-stub.js");
  const betterAuthStub = join(dir, "better-auth-stub.js");
  const assetStub = join(dir, "asset-stub.js");
  const enrollStub = join(dir, "enroll-stub.js");
  const startSessionStub = join(dir, "start-session-stub.js");
  const completeSessionStub = join(dir, "complete-session-stub.js");
  writeFileSync(imageStub, `export default function Image(props) { return <img alt={props.alt || ""} />; }\n`);
  writeFileSync(
    headersStub,
    `export async function headers() { return new Headers(); }
export async function cookies() { return { get() { return undefined; } }; }
`,
  );
  writeFileSync(cacheStub, `export function revalidatePath() {}\nexport function revalidateTag() {}\n`);
  writeFileSync(confettiStub, `export default function confetti() {}\n`);
  writeFileSync(envStub, `export const env = new Proxy({}, { get: () => "" });\n`);
  writeFileSync(prismaLibStub, `export const prisma = new Proxy({}, { get: () => () => Promise.resolve(null) });\n`);
  writeFileSync(
    authClientStub,
    `export function useSession() { return { data: null, isPending: false }; }
export const authClient = { useSession };
export const useIsAdmin = () => false;
`,
  );
  writeFileSync(betterAuthStub, `export const auth = { api: { getSession: async () => null } };\n`);
  writeFileSync(assetStub, `export default "";\n`);
  writeFileSync(enrollStub, `export async function enrollInProgram() { return { enrollment: { id: "enroll-1" } }; }\n`);
  writeFileSync(startSessionStub, `export async function startProgramSession() { return { sessionProgress: { id: "progress-1" } }; }\n`);
  writeFileSync(
    completeSessionStub,
    `export async function completeProgramSession() { return { isCompleted: false, nextWeek: 1, nextSession: "next" }; }\n`,
  );
  writeFileSync(
    navigationStub,
    `export function useRouter() {
  return {
    push(href) {
      window.__wcPushes = window.__wcPushes || [];
      window.__wcPushes.push(href);
    },
    replace() {},
    back() {},
    prefetch() {}
  };
}
export function usePathname() { return "/"; }
export function useSearchParams() { return new URLSearchParams(); }
export function notFound() {}
export function redirect() {}
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
  const programClient = join(process.cwd(), "app/[locale]/(app)/programs/[slug]/session/[sessionSlug]/ProgramSessionClient.tsx");
  writeFileSync(
    entry,
    `import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ProgramSessionClient } from ${JSON.stringify(programClient)};
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

function ProgramHarness() {
  useEffect(() => {
    const post = () => {
      window.parent.postMessage({ type: "wc:height", height: document.documentElement.scrollHeight }, "*");
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    window.__wcPushes = [];
    const timer = setTimeout(() => document.documentElement.setAttribute("data-wc-ready", "1"), 0);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  return (
    <ProgramSessionClient
      isAuthenticated={true}
      isPremium={false}
      program={{
        id: "program-1",
        title: "Starter",
        titleEn: "Starter",
        description: "",
        descriptionEn: "",
        slug: "starter",
        slugEn: "starter"
      }}
      session={{
        id: "session-1",
        title: "Day 1",
        titleEn: "Day 1",
        description: "",
        descriptionEn: "",
        slug: "day-1",
        slugEn: "day-1",
        isPremium: false,
        exercises: [{
          id: "pex-1",
          order: 0,
          suggestedSets: [],
          exercise: {
            id: "ex-1",
            name: "Squat",
            nameEn: "Squat",
            description: "",
            descriptionEn: "",
            fullVideoUrl: null,
            fullVideoImageUrl: null,
            attributes: []
          }
        }]
      }}
      week={{ weekNumber: 1 }}
    />
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
  if (new URLSearchParams(location.search).get("rows") === "3") {
    window.__wcSessions.push({
      id: "hist-3",
      status: "completed",
      startedAt: "2026-01-04T15:04:00.000Z",
      endedAt: "2026-01-04T16:00:00.000Z",
      muscles: [],
      exercises: [{ id: "ex-3", name: "Press", nameEn: "Press", order: 0, attributes: [] }]
    });
  }
}
createRoot(document.getElementById("root")).render(
  card === "delete" ? <DeletePreview /> : card === "history" ? <HistoryHarness /> : card === "program" ? <ProgramHarness /> : <App />
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
          build.onResolve({ filter: /^next\/image$/ }, () => ({ path: imageStub }));
          build.onResolve({ filter: /^next\/headers$/ }, () => ({ path: headersStub }));
          build.onResolve({ filter: /^next\/cache$/ }, () => ({ path: cacheStub }));
          build.onResolve({ filter: /^canvas-confetti$/ }, () => ({ path: confettiStub }));
          build.onResolve({ filter: /^@\/env$/ }, () => ({ path: envStub }));
          build.onResolve({ filter: /^@\/shared\/lib\/prisma$/ }, () => ({ path: prismaLibStub }));
          build.onResolve({ filter: /^@\/features\/auth\/lib\/auth-client$/ }, () => ({ path: authClientStub }));
          build.onResolve({ filter: /^@\/features\/auth\/lib\/better-auth$/ }, () => ({ path: betterAuthStub }));
          build.onResolve({ filter: /\/enroll-program\.action$/ }, () => ({ path: enrollStub }));
          build.onResolve({ filter: /\/start-program-session\.action$/ }, () => ({ path: startSessionStub }));
          build.onResolve({ filter: /\/complete-program-session\.action$/ }, () => ({ path: completeSessionStub }));
          build.onResolve({ filter: /^@public\// }, () => ({ path: assetStub }));
          build.onResolve({ filter: /\.(png|jpe?g|webp|svg|gif)$/ }, () => ({ path: assetStub }));
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
            const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base];
            const found = candidates.find((candidate) => existsSync(candidate) && !statSync(candidate).isDirectory());
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

async function assertEmbedButtonHeights(frame, selector) {
  const heights = await frame.locator(selector).evaluate((root) => {
    return [...root.querySelectorAll("button")].map((button) => button.getBoundingClientRect().height);
  });
  if (heights.length < 2) throw new Error(`${selector} has ${heights.length} buttons`);
  for (const height of heights) {
    if (height < 48) throw new Error(`${selector} button is ${height}px`);
  }
  console.log(`BUTTON_HEIGHTS ${selector} ${heights.join(",")}`);
}

async function readActiveFocus(target) {
  return target.evaluate(() => {
    const element = document.activeElement;
    const empty = {
      tag: element?.tagName || "",
      visible: false,
      outlineAlpha: 1,
      outlineStyle: "",
      outlineColor: "",
      boxShadow: "",
    };
    if (!element || element === document.body) return empty;
    const style = getComputedStyle(element);
    const parse = (value) => {
      const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
    };
    const layers = [];
    const shadow = style.boxShadow;
    if (shadow && shadow !== "none") {
      let current = "";
      let depth = 0;
      for (const char of shadow) {
        if (char === "(") depth += 1;
        else if (char === ")") depth -= 1;
        if (char === "," && depth === 0) {
          layers.push(current);
          current = "";
        } else current += char;
      }
      if (current.trim()) layers.push(current);
    }
    const visibleShadow = layers.some((layer) => {
      const color = parse(layer);
      const widths = [...layer.matchAll(/([\d.]+)px/g)].map((match) => Number(match[1]));
      const width = widths.length ? Math.max(...widths) : 0;
      return Boolean(color && color[3] > 0 && width > 0);
    });
    const outline = parse(style.outlineColor);
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
    const outlineAlpha = outline ? outline[3] : String(style.outlineColor).includes("transparent") ? 0 : 1;
    const visibleOutline = outlineAlpha > 0 && outlineWidth > 0 && style.outlineStyle !== "none";
    return {
      tag: element.tagName,
      visible: visibleShadow || visibleOutline,
      outlineAlpha,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  });
}

async function assertActiveRing(target, label) {
  const ring = await readActiveFocus(target);
  if (!ring.visible) throw new Error(`${label} focus ring missing (${ring.boxShadow} / ${ring.outlineColor})`);
  return ring;
}

async function assertTitleRing(target) {
  const ring = await assertActiveRing(target, "title");
  if (ring.tag !== "H3") throw new Error(`title ring read ${ring.tag}`);
  if (ring.outlineAlpha > 0) {
    throw new Error(`title shows the browser outline (${ring.outlineStyle} ${ring.outlineColor})`);
  }
}

async function assertNoTitleRing(target) {
  const ring = await readActiveFocus(target);
  if (ring.tag !== "H3") throw new Error(`pointer open focused ${ring.tag}`);
  if (ring.visible || ring.outlineAlpha > 0) {
    throw new Error(`pointer open showed a title ring (${ring.boxShadow} / ${ring.outlineColor})`);
  }
}

async function openAndAssertTitle(frame, opener, title, expectRing) {
  await opener();
  await frame.getByRole("dialog", { name: title }).waitFor();
  if (expectRing) await assertTitleRing(frame);
  else await assertNoTitleRing(frame);
}

async function assertTrapRings(frame, firstLabel, lastLabel, label, afterForwardWrap) {
  await frame.locator("[data-wc-quit-confirm] h3").press("Tab");
  if ((await focusedName(frame)) !== firstLabel) {
    throw new Error(`${label} Tab from title left focus on ${await focusedName(frame)}`);
  }
  await frame.getByRole("button", { name: firstLabel }).press("Tab");
  if ((await focusedName(frame)) !== lastLabel) {
    throw new Error(`${label} Tab from first left focus on ${await focusedName(frame)}`);
  }
  await frame.getByRole("button", { name: lastLabel }).press("Tab");
  if ((await focusedName(frame)) !== firstLabel) {
    throw new Error(`${label} Tab wrap left focus on ${await focusedName(frame)}`);
  }
  await assertActiveRing(frame, `${label} tab wrap`);
  if (afterForwardWrap) await afterForwardWrap();
  await frame.getByRole("button", { name: firstLabel }).press("Shift+Tab");
  if ((await focusedName(frame)) !== lastLabel) {
    throw new Error(`${label} Shift+Tab wrap left focus on ${await focusedName(frame)}`);
  }
  await assertActiveRing(frame, `${label} shift tab wrap`);
}

async function runTitleModality(browser, parentOrigin, childOrigin, engine, saveShot = async () => {}) {
  const quitLabel = localeValue("quit_workout");
  const title = localeValue("embed_quit_title");
  const keepLabel = localeValue("embed_quit_cancel");
  const deleteLabel = localeValue("delete");
  const deleteTitle = localeValue("delete_workout_title");
  const cancelLabel = localeValue("cancel");
  const phone = await openPhone(browser, parentOrigin, childOrigin, "?embed=1", { hasTouch: true });
  try {
    await phone.frame.getByRole("button", { name: "Start workout" }).click();
    await phone.frame.locator("[data-wc-active='1']").waitFor();
    const quit = phone.frame.getByRole("button", { name: quitLabel });
    const closeQuit = () => phone.frame.getByRole("button", { name: keepLabel }).click();
    await openAndAssertTitle(phone.frame, () => quit.click(), title, false);
    await closeQuit();
    await openAndAssertTitle(phone.frame, () => quit.tap(), title, false);
    await closeQuit();
    await openAndAssertTitle(phone.frame, () => quit.press("Enter"), title, true);
    await closeQuit();
    await openAndAssertTitle(phone.frame, () => quit.press("Space"), title, true);
    await closeQuit();
    const discardLabel = localeValue("embed_quit_confirm");
    await openAndAssertTitle(phone.frame, () => quit.press("Enter"), title, true);
    await closeQuit();
    await openAndAssertTitle(phone.frame, () => quit.click(), title, false);
    await assertTrapRings(phone.frame, discardLabel, keepLabel, `${engine} light`, async () => {
      if (engine === "webkit") await saveShot(phone.page, "confirm-390-light-webkit-tabwrap.png");
    });
  } finally {
    await phone.page.close();
  }
  const dark = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&dark=1", { hasTouch: true });
  try {
    await dark.frame.getByRole("button", { name: "Start workout" }).click();
    await dark.frame.locator("[data-wc-active='1']").waitFor();
    await dark.frame.getByRole("button", { name: quitLabel }).click();
    await dark.frame.getByRole("dialog", { name: title }).waitFor();
    const discardLabel = localeValue("embed_quit_confirm");
    await assertTrapRings(dark.frame, discardLabel, keepLabel, `${engine} dark`, async () => {
      if (engine === "webkit") await saveShot(dark.page, "confirm-390-dark-webkit-tabwrap.png");
    });
  } finally {
    await dark.page.close();
  }
  const history = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&card=history", { hasTouch: true });
  history.page.on("dialog", (dialog) => dialog.dismiss());
  try {
    const historyDelete = history.frame.locator("ul").getByRole("button", { name: deleteLabel }).first();
    const closeDelete = () => history.frame.getByRole("button", { name: cancelLabel }).click();
    await openAndAssertTitle(history.frame, () => historyDelete.click(), deleteTitle, false);
    await closeDelete();
    await openAndAssertTitle(history.frame, () => historyDelete.tap(), deleteTitle, false);
    await closeDelete();
    await openAndAssertTitle(history.frame, () => historyDelete.press("Enter"), deleteTitle, true);
    await closeDelete();
    await openAndAssertTitle(history.frame, () => historyDelete.press("Space"), deleteTitle, true);
  } finally {
    await history.page.close();
  }
  console.log(`TITLE_ENGINE ${engine} pointer=no-ring tap=no-ring keyboard=ring`);
}

function missingEngine(name, error) {
  const requiredInCi = name === "chromium" || name === "webkit";
  if (process.env.CI === "true" && requiredInCi) {
    throw new Error(`${name} is not available in CI (${error.message}).`);
  }
  console.log(`TITLE_ENGINE ${name} skipped (${error.message})`);
}

async function runWebKitTitleModality(parentOrigin, childOrigin, saveShot) {
  let webkit;
  try {
    ({ webkit } = require("playwright"));
  } catch (error) {
    missingEngine("webkit", error);
    return;
  }
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
  } catch (error) {
    missingEngine("webkit", error);
    return;
  }
  try {
    await runTitleModality(browser, parentOrigin, childOrigin, "webkit", saveShot);
    await assertThrowingQuitDblclick(browser, parentOrigin, childOrigin, "webkit");
  } finally {
    await browser.close();
  }
}

async function assertSecondWorkoutQuit(browser, parentOrigin, childOrigin, engine) {
  const quitLabel = localeValue("quit_workout");
  const discardLabel = localeValue("embed_quit_confirm");
  const title = localeValue("embed_quit_title");
  const phone = await openPhone(browser, parentOrigin, childOrigin, "?embed=1");
  try {
    await phone.frame.getByRole("button", { name: "Start workout" }).click();
    await phone.frame.locator("[data-wc-active='1']").waitFor();
    const firstSession = await phone.frame.locator("[data-wc-session]").getAttribute("data-wc-session");
    await phone.frame.getByRole("button", { name: quitLabel }).evaluate((element) => {
      element.dataset.wcMount = "first";
    });
    await phone.frame.evaluate(() => {
      const store = window.__wcSessionStore;
      const original = store.getState().quitWorkout;
      window.__wcQuitCalls = 0;
      store.setState({
        quitWorkout: () => {
          window.__wcQuitCalls += 1;
          original();
        },
      });
    });
    await phone.frame.getByRole("button", { name: quitLabel }).click();
    await phone.frame.getByRole("dialog", { name: title }).waitFor();
    await phone.frame.getByRole("button", { name: discardLabel }).click();
    await phone.frame.locator("[data-wc-active='0']").waitFor();
    await phone.frame.getByRole("button", { name: "Start workout" }).click();
    await phone.frame.locator("[data-wc-active='1']").waitFor();
    const secondSession = await phone.frame.locator("[data-wc-session]").getAttribute("data-wc-session");
    if (!secondSession || secondSession === firstSession) throw new Error(`${engine} second workout reused ${firstSession}`);
    const remounted = await phone.frame.getByRole("button", { name: quitLabel }).getAttribute("data-wc-mount");
    if (remounted === "first") throw new Error(`${engine} quit dialog stayed mounted`);
    await phone.frame.getByRole("button", { name: quitLabel }).click();
    await phone.frame.getByRole("dialog", { name: title }).waitFor();
    await phone.frame.getByRole("button", { name: discardLabel }).click();
    const calls = await phone.frame.evaluate(() => window.__wcQuitCalls || 0);
    if (calls !== 2) throw new Error(`${engine} second workout quit ran ${calls} times`);
    await phone.frame.locator("[data-wc-active='0']").waitFor();
  } finally {
    await phone.page.close();
  }
  console.log(`SECOND_WORKOUT_QUIT ${engine} remount=1 calls=2`);
}

async function assertReportErrorDeleted(browser, parentOrigin, childOrigin, engine) {
  const quitLabel = localeValue("quit_workout");
  const discardLabel = localeValue("embed_quit_confirm");
  const title = localeValue("embed_quit_title");
  const phone = await openPhone(browser, parentOrigin, childOrigin, "?embed=1");
  try {
    await phone.frame.getByRole("button", { name: "Start workout" }).click();
    await phone.frame.locator("[data-wc-active='1']").waitFor();
    const removed = await phone.frame.evaluate(() => {
      window.__wcUnhandled = 0;
      window.addEventListener("unhandledrejection", () => {
        window.__wcUnhandled += 1;
      });
      const prototype = Object.getPrototypeOf(window);
      delete prototype.reportError;
      delete window.reportError;
      window.__wcSessionStore.setState({
        quitWorkout: () => {
          throw new Error("hold");
        },
      });
      return typeof window.reportError;
    });
    if (removed !== "undefined") throw new Error(`${engine} reportError stayed ${removed}`);
    await phone.frame.getByRole("button", { name: quitLabel }).click();
    await phone.frame.getByRole("dialog", { name: title }).waitFor();
    await phone.frame.getByRole("button", { name: discardLabel }).click();
    // The catch runs before finally waits out the 500ms guard, so a throw there rejects only after that wait.
    await phone.frame.evaluate((delay) => new Promise((resolve) => window.setTimeout(resolve, delay)), 700);
    const unhandled = await phone.frame.evaluate(() => window.__wcUnhandled || 0);
    if (unhandled !== 0) throw new Error(`${engine} missing reportError fired unhandledrejection ${unhandled} times`);
  } finally {
    await phone.page.close();
  }
  console.log(`REPORT_ERROR_DELETED ${engine} unhandled=0`);
}

async function assertGuardTimerClearedOnUnmount(browser, parentOrigin, childOrigin, engine) {
  const quitLabel = localeValue("quit_workout");
  const discardLabel = localeValue("embed_quit_confirm");
  const title = localeValue("embed_quit_title");
  const phone = await openPhone(browser, parentOrigin, childOrigin, "?embed=1");
  try {
    await phone.frame.getByRole("button", { name: "Start workout" }).click();
    await phone.frame.locator("[data-wc-active='1']").waitFor();
    await phone.frame.evaluate(() => {
      window.__wcSessionStore.setState({
        quitWorkout: () => {
          throw new Error("hold");
        },
      });
    });
    await phone.frame.getByRole("button", { name: quitLabel }).click();
    await phone.frame.getByRole("dialog", { name: title }).waitFor();
    await phone.frame.evaluate(() => {
      window.__wcTimerLog = [];
      window.__wcHeaderUnmounted = false;
      window.__wcUnmountStateErrors = 0;
      const set = window.setTimeout.bind(window);
      const clear = window.clearTimeout.bind(window);
      const report = console.error.bind(console);
      console.error = (...args) => {
        const text = args.map((item) => (typeof item === "string" ? item : item instanceof Error ? item.message : "")).join(" ");
        if (text.includes("unmounted") || text.includes("Can't perform a React state update")) window.__wcUnmountStateErrors += 1;
        return report(...args);
      };
      window.setTimeout = (fn, delay, ...args) => {
        const delayMs = Number(delay) || 0;
        const record = { delay: delayMs, fired: false, cleared: false, armed: !window.__wcHeaderUnmounted };
        const id = set(() => {
          if (record.cleared) return undefined;
          record.fired = true;
          if (typeof fn === "function") return fn(...args);
          return undefined;
        }, delay);
        record.id = id;
        window.__wcTimerLog.push(record);
        return id;
      };
      window.clearTimeout = (id) => {
        const record = window.__wcTimerLog.find((item) => item.id === id);
        if (record) record.cleared = true;
        return clear(id);
      };
    });
    await phone.frame.getByRole("button", { name: discardLabel }).click();
    await phone.frame.waitForFunction(() => (window.__wcTimerLog || []).some((timer) => timer.armed && timer.delay >= 100));
    await phone.frame.evaluate(() => {
      window.__wcHeaderUnmounted = true;
      window.__wcSessionStore.setState({ isWorkoutActive: false, session: null });
    });
    await phone.frame.locator("[data-wc-active='0']").waitFor();
    await phone.frame.evaluate((delay) => new Promise((resolve) => window.setTimeout(resolve, delay)), 700);
    const stats = await phone.frame.evaluate(() => {
      const armed = (window.__wcTimerLog || []).filter((timer) => timer.armed && timer.delay >= 100);
      const guard = armed.reduce((best, timer) => (!best || timer.delay > best.delay ? timer : best), null);
      return {
        delay: guard ? guard.delay : -1,
        cleared: guard && guard.cleared ? 1 : 0,
        fired: guard && guard.fired ? 1 : 0,
        setState: window.__wcUnmountStateErrors || 0,
      };
    });
    if (stats.delay < 100 || stats.cleared !== 1 || stats.fired !== 0 || stats.setState !== 0) {
      throw new Error(
        `${engine} guard timer survived unmount ` +
          `(delay ${stats.delay}, cleared ${stats.cleared}, fired ${stats.fired}, setState ${stats.setState})`,
      );
    }
  } finally {
    await phone.page.close();
  }
  console.log(`GUARD_TIMER_UNMOUNT ${engine} cleared=1 fired=0 setState=0`);
}

async function assertThrowingQuitDblclick(browser, parentOrigin, childOrigin, engine) {
  const quitLabel = localeValue("quit_workout");
  const discardLabel = localeValue("embed_quit_confirm");
  const title = localeValue("embed_quit_title");
  const phone = await openPhone(browser, parentOrigin, childOrigin, "?embed=1");
  let gap150Ms = -1;
  let gap300Ms = -1;
  let reenableMs = -1;
  let holdMs = -1;
  let holdFrom = "none";
  const consoleLines = [];
  const onConsole = (message) => {
    consoleLines.push(`${message.type()}: ${message.text()}`);
  };
  const onPageError = (error) => {
    consoleLines.push(`pageerror: ${error.message}`);
  };
  phone.page.on("console", onConsole);
  phone.page.on("pageerror", onPageError);
  try {
    await phone.frame.getByRole("button", { name: "Start workout" }).click();
    await phone.frame.locator("[data-wc-active='1']").waitFor();
    await phone.frame.evaluate(() => {
      const store = window.__wcSessionStore;
      window.__wcQuitCalls = 0;
      window.__wcUnhandled = 0;
      window.addEventListener("unhandledrejection", () => {
        window.__wcUnhandled += 1;
      });
      store.setState({
        quitWorkout: () => {
          window.__wcQuitCalls += 1;
          throw new Error("hold");
        },
      });
    });
    await phone.frame.getByRole("button", { name: quitLabel }).click();
    await phone.frame.getByRole("dialog", { name: title }).waitFor();
    const confirm = phone.frame.getByRole("button", { name: discardLabel });
    const quitCalls = async () => phone.frame.evaluate(() => window.__wcQuitCalls || 0);
    const wait = (ms) => phone.frame.evaluate((delay) => new Promise((resolve) => window.setTimeout(resolve, delay)), ms);
    const resetCalls = () =>
      phone.frame.evaluate(() => {
        window.__wcQuitCalls = 0;
      });
    await phone.frame.evaluate(() => {
      window.__wcClickMarks = [];
      window.addEventListener(
        "pointerdown",
        () => {
          window.__wcClickMarks.push(performance.now());
        },
        true,
      );
    });
    const resetMarks = () =>
      phone.frame.evaluate(() => {
        window.__wcClickMarks = [];
      });
    const guardMs = readQuitGuardMs();
    const gapWindows = { "150ms": { low: 100, high: 250 }, "300ms": { low: 250, high: 450 } };
    const lockedGapCeilings = { "150ms": 250, "300ms": 450 };
    const ceiling150 = gapWindows["150ms"].high;
    const ceiling300 = gapWindows["300ms"].high;
    const locked150 = lockedGapCeilings["150ms"];
    const locked300 = lockedGapCeilings["300ms"];
    const assertGapCeilings = () => {
      if (!(ceiling300 <= guardMs - 50)) {
        throw new Error(`${engine} 300ms gap ceiling ${ceiling300} exceeds guard ${guardMs} - 50`);
      }
      if (!(ceiling150 <= ceiling300 - 200)) {
        throw new Error(`${engine} 150ms gap ceiling ${ceiling150} exceeds ${ceiling300} - 200`);
      }
      if (!(locked300 <= guardMs - 50)) {
        throw new Error(`${engine} locked 300ms gap ceiling ${locked300} exceeds guard ${guardMs} - 50`);
      }
      if (!(locked150 <= locked300 - 200)) {
        throw new Error(`${engine} locked 150ms gap ceiling ${locked150} exceeds ${locked300} - 200`);
      }
      if (ceiling150 !== locked150 || ceiling300 !== locked300) {
        throw new Error(`${engine} gap ceilings loosened to ${ceiling150} and ${ceiling300}`);
      }
      for (const [label, bounds] of Object.entries(gapWindows)) {
        if (!(bounds.low > 0 && bounds.low < bounds.high && bounds.high < guardMs)) {
          throw new Error(`${label} gap bound ${bounds.low}..${bounds.high} is not ordered`);
        }
      }
    };
    const readGap = async (label) => {
      const bounds = gapWindows[label];
      const gap = await phone.frame.evaluate(() => {
        const marks = window.__wcClickMarks || [];
        if (marks.length !== 2) return { gap: -1, count: marks.length };
        return { gap: Math.round(marks[1] - marks[0]), count: 2 };
      });
      const inside = gap.count === 2 && gap.gap > bounds.low && gap.gap < bounds.high && gap.gap < guardMs;
      if (!inside) {
        throw new Error(
          `${engine} ${label} click gap was ${gap.gap}ms (${gap.count} pointerdowns), ` +
            `expected ${bounds.low} < gap < ${bounds.high} and < ${guardMs}`,
        );
      }
      return gap.gap;
    };
    await confirm.dblclick();
    if ((await quitCalls()) !== 1) throw new Error(`${engine} throwing quit ran ${await quitCalls()} times`);
    await wait(520);
    await resetCalls();
    await resetMarks();
    await confirm.click();
    await wait(150);
    await confirm.click({ force: true });
    const gapFailures = [];
    try {
      gap150Ms = await readGap("150ms");
    } catch (error) {
      gapFailures.push(error instanceof Error ? error.message : String(error));
    }
    if ((await quitCalls()) !== 1) gapFailures.push(`${engine} throwing quit ran ${await quitCalls()} times after 150ms`);
    await wait(520);
    await resetCalls();
    await resetMarks();
    await confirm.click();
    await wait(300);
    await confirm.click({ force: true });
    try {
      gap300Ms = await readGap("300ms");
    } catch (error) {
      gapFailures.push(error instanceof Error ? error.message : String(error));
    }
    if ((await quitCalls()) !== 1) gapFailures.push(`${engine} throwing quit ran ${await quitCalls()} times after 300ms`);
    if (gapFailures.length) throw new Error(gapFailures.join("\n"));
    await wait(520);
    await resetCalls();
    const holdFloorMs = 495;
    const reenableHighMs = 680;
    const enabledNow = () => confirm.isEnabled({ timeout: 0 });
    const waitUntilEnabled = async (timeoutMs) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt <= timeoutMs) {
        if (await enabledNow()) return Date.now() - startedAt;
        const left = timeoutMs - (Date.now() - startedAt);
        if (left <= 0) break;
        await wait(Math.min(20, left));
      }
      return -1;
    };
    const measureReenable = async (startedAt, deadlineMs) => {
      let sawDisabled = false;
      while (Date.now() - startedAt <= deadlineMs) {
        const enabled = await enabledNow();
        if (!enabled) sawDisabled = true;
        if (sawDisabled && enabled) return { reenableMs: Date.now() - startedAt, sawDisabled: true };
        const left = deadlineMs - (Date.now() - startedAt);
        if (left <= 0) break;
        await wait(Math.min(20, left));
      }
      return { reenableMs: -1, sawDisabled };
    };
    const armHoldProbe = () =>
      confirm.evaluate((button) => {
        const hold = { clickAt: 0, handlerAt: 0, disabledAt: 0, enabledAt: 0 };
        window.__wcHold = hold;
        const mark = () => {
          const now = performance.now();
          if (button.disabled) {
            if (!hold.disabledAt) hold.disabledAt = now;
            return;
          }
          if (hold.disabledAt && !hold.enabledAt) hold.enabledAt = now;
        };
        const onClick = () => {
          if (!hold.clickAt) hold.clickAt = performance.now();
        };
        button.addEventListener("click", onClick, true);
        const observer = new MutationObserver(mark);
        observer.observe(button, { attributes: true, attributeFilter: ["disabled"] });
        const timer = window.setInterval(mark, 5);
        const nativeSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, delay, ...args) => {
          const delayMs = Number(delay) || 0;
          if (hold.clickAt && !hold.handlerAt && delayMs < 5) hold.handlerAt = performance.now();
          return nativeSetTimeout(fn, delay, ...args);
        };
        window.__wcHoldStop = () => {
          window.setTimeout = nativeSetTimeout;
          button.removeEventListener("click", onClick, true);
          observer.disconnect();
          window.clearInterval(timer);
        };
      });
    const readHold = () =>
      confirm.evaluate(() => {
        const hold = window.__wcHold || { clickAt: 0, handlerAt: 0, disabledAt: 0, enabledAt: 0 };
        if (window.__wcHoldStop) window.__wcHoldStop();
        const start = hold.handlerAt || hold.disabledAt;
        const end = hold.enabledAt;
        return {
          holdMs: start && end ? Math.round(end - start) : -1,
          from: hold.handlerAt ? "handler" : hold.disabledAt ? "disabled" : "none",
        };
      });
    if ((await waitUntilEnabled(1500)) < 0) {
      throw new Error(`${engine} confirm stayed disabled before the re-enable sample (guard ${guardMs}ms)`);
    }
    const started = Date.now();
    await armHoldProbe();
    await confirm.click({ timeout: 1000 });
    const disabledAt430 = await confirm.evaluate((button) => {
      return new Promise((resolve) => {
        const start = (window.__wcHold && window.__wcHold.clickAt) || performance.now();
        const sample = () => resolve(Boolean(button.disabled));
        const left = start + 430 - performance.now();
        if (left <= 0) sample();
        else window.setTimeout(sample, left);
      });
    });
    if (!disabledAt430) {
      throw new Error(`${engine} confirm re-enabled before 430ms after the throwing click (guard ${guardMs}ms)`);
    }
    const reenable = await measureReenable(started, reenableHighMs);
    if (!reenable.sawDisabled) throw new Error(`${engine} confirm never disabled after the throwing click`);
    if (reenable.reenableMs < 0) {
      throw new Error(`${engine} confirm still disabled ${reenableHighMs}ms after the throwing click (guard ${guardMs}ms)`);
    }
    if (reenable.reenableMs > reenableHighMs) {
      throw new Error(`${engine} confirm re-enabled at ${reenable.reenableMs}ms, expected <= ${reenableHighMs} (guard ${guardMs}ms)`);
    }
    const hold = await readHold();
    if (hold.holdMs < holdFloorMs) {
      throw new Error(`${engine} confirm hold was ${hold.holdMs}ms, expected >= ${holdFloorMs} (guard ${guardMs}ms)`);
    }
    reenableMs = reenable.reenableMs;
    holdMs = hold.holdMs;
    holdFrom = hold.from;
    assertGapCeilings();
    const elapsed = Date.now() - started;
    if (700 - elapsed > 0) await wait(700 - elapsed);
    if (!(await enabledNow())) throw new Error(`${engine} confirm still disabled at the 700ms retry`);
    await confirm.click({ timeout: 1000 });
    if ((await quitCalls()) !== 2) throw new Error(`${engine} throwing quit retry ran ${await quitCalls()} times`);
    const unhandled = await phone.frame.evaluate(() => window.__wcUnhandled || 0);
    if (unhandled !== 0) throw new Error(`${engine} throwing quit fired unhandledrejection ${unhandled} times`);
    await wait(520);
    await phone.frame.evaluate(() => {
      window.__wcQuitCalls = 0;
      window.__wcSessionStore.setState({
        quitWorkout: () => {
          window.__wcQuitCalls += 1;
        },
      });
    });
    await confirm.click();
    await phone.frame.getByRole("dialog", { name: title }).waitFor({ state: "hidden" });
    await phone.frame.getByRole("button", { name: quitLabel }).click();
    await phone.frame.getByRole("dialog", { name: title }).waitFor();
    await phone.frame.getByRole("button", { name: discardLabel }).click({ force: true });
    if ((await quitCalls()) !== 1) throw new Error(`${engine} success quit ran ${await quitCalls()} times`);
  } finally {
    phone.page.off("console", onConsole);
    phone.page.off("pageerror", onPageError);
    await phone.page.close();
  }
  const reported = consoleLines.filter((line) => /hold|pageerror|uncaught|unhandled|reportError/i.test(line));
  console.log(`THROWING_QUIT_CONSOLE ${engine} ${JSON.stringify(reported)}`);
  console.log(
    `THROWING_QUIT ${engine} dblclick=1 gap150=1 gap300=1 retry700=2 success=1 unhandled=0 ` +
      `gap150Ms=${gap150Ms} gap300Ms=${gap300Ms} holdMs=${holdMs} holdFrom=${holdFrom} reenableMs=${reenableMs}`,
  );
  await assertReportErrorDeleted(browser, parentOrigin, childOrigin, engine);
  await assertSecondWorkoutQuit(browser, parentOrigin, childOrigin, engine);
  await assertGuardTimerClearedOnUnmount(browser, parentOrigin, childOrigin, engine);
}

async function runFirefoxThrowingQuit(parentOrigin, childOrigin) {
  let firefox;
  try {
    ({ firefox } = require("playwright"));
  } catch (error) {
    missingEngine("firefox", error);
    return;
  }
  let browser;
  try {
    browser = await firefox.launch({ headless: true });
  } catch (error) {
    missingEngine("firefox", error);
    return;
  }
  try {
    await assertThrowingQuitDblclick(browser, parentOrigin, childOrigin, "firefox");
  } finally {
    await browser.close();
  }
}

async function storedSession(frame) {
  return frame.evaluate(() => ({
    current: localStorage.getItem("currentWorkoutSessionId"),
    sessions: JSON.parse(localStorage.getItem("workoutSessions") || "[]"),
  }));
}

async function assertProgramQuit(target, embed) {
  const startLabel = localeValue("start_session");
  const quitLabel = localeValue("quit_workout");
  const confirmLabel = embed ? localeValue("embed_quit_confirm") : localeValue("quit_without_save");
  await target.evaluate(() => {
    localStorage.clear();
    window.__wcPushes = [];
  });
  await target.getByRole("button", { name: startLabel }).click();
  await target.getByRole("button", { name: quitLabel }).waitFor();
  const started = await storedSession(target);
  if (!started.current) throw new Error("program start did not save a current session");
  if (!started.sessions.some((session) => session.id === started.current && session.status === "active")) {
    throw new Error("program start did not save an active session");
  }
  await target.getByRole("button", { name: quitLabel }).click();
  await target.getByRole("button", { name: confirmLabel }).click();
  await target.getByRole("button", { name: startLabel }).waitFor();
  const cleared = await storedSession(target);
  if (cleared.current !== null) throw new Error("program quit left currentWorkoutSessionId");
  if (cleared.sessions.length !== 0) throw new Error("program quit left a saved session");
  if (cleared.sessions.some((session) => session.status === "completed")) throw new Error("program quit marked a session completed");
  const pushes = await target.evaluate(() => window.__wcPushes || []);
  if (embed) {
    if (pushes.length !== 1 || pushes[0] !== "/?embed=1") {
      throw new Error(`embed program quit pushed ${JSON.stringify(pushes)}`);
    }
    return;
  }
  if (pushes.length !== 0) throw new Error(`plain program quit pushed ${JSON.stringify(pushes)}`);
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

async function openPhone(browser, parentOrigin, childOrigin, search, pageOptions = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, ...pageOptions });
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

    const harnessFailures = [];
    try {
    await assertThrowingQuitDblclick(browser, parentOrigin, childOrigin, "chromium");
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
    // Pointer open keeps focus on the title and must not paint its ring. The ring check moved to the Enter open below.
    await assertNoTitleRing(light.frame);
    await saveShot(light.page, "confirm-390-light-pointer.png");
    await light.frame.locator("[data-wc-quit-confirm] h3").press("Tab");
    if ((await focusedName(light.frame)) !== discardLabel) {
      throw new Error(`Tab from title left focus on ${await focusedName(light.frame)}`);
    }
    await assertActiveRing(light.frame, "quit confirm");
    await saveShot(light.page, "confirm-390-light-focusring.png");
    await light.frame.getByRole("button", { name: discardLabel }).press("Tab");
    if ((await focusedName(light.frame)) !== keepLabel) {
      throw new Error(`Tab from confirm left focus on ${await focusedName(light.frame)}`);
    }
    await assertActiveRing(light.frame, "keep going");
    await light.frame.getByRole("button", { name: keepLabel }).press("Tab");
    if ((await focusedName(light.frame)) !== discardLabel) {
      throw new Error(`Tab wrap left focus on ${await focusedName(light.frame)}`);
    }
    await assertActiveRing(light.frame, "tab wrap");
    await light.frame.getByRole("button", { name: discardLabel }).press("Shift+Tab");
    if ((await focusedName(light.frame)) !== keepLabel) {
      throw new Error(`Shift+Tab wrap left focus on ${await focusedName(light.frame)}`);
    }
    await assertActiveRing(light.frame, "shift tab wrap");
    const described = await light.frame.locator("[data-wc-quit-confirm]").evaluate((element) => {
      const id = element.getAttribute("aria-describedby");
      return id ? (document.getElementById(id)?.textContent?.trim() ?? "") : "";
    });
    if (described !== localeValue("embed_quit_warning")) throw new Error(`quit describedby ${described}`);
    await assertInPhone(light.page, light.frame, "[data-wc-quit-confirm]");
    await assertDesign(light.frame);
    await assertEmbedButtonHeights(light.frame, "[data-wc-quit-confirm]");
    await saveShot(light.page, "confirm-390-light.png");
    await light.frame.getByRole("button", { name: keepLabel }).click();
    if ((await focusedName(light.frame)).includes(quitLabel) === false) {
      throw new Error(`Keep going left focus on ${await focusedName(light.frame)}`);
    }
    if ((await light.frame.locator("[data-wc-quit-confirm]").count()) !== 0) throw new Error("Keep going left the confirm open");
    const keydownAfter = await light.frame.evaluate(() => window.__wcKeydown);
    if (keydownAfter !== keydownBefore) throw new Error(`Escape listener leaked (${keydownAfter} vs ${keydownBefore})`);
    await light.frame.getByRole("button", { name: quitLabel }).press("Enter");
    await light.frame.getByRole("dialog", { name: title }).waitFor();
    await assertTitleRing(light.frame);
    await saveShot(light.page, "confirm-390-light-keyboard.png");
    await light.frame.getByRole("button", { name: keepLabel }).click();
    if ((await light.frame.locator("[data-wc-quit-confirm]").count()) !== 0) {
      throw new Error("keyboard Keep going left the confirm open");
    }
    await light.frame.getByRole("button", { name: quitLabel }).click();
    await light.frame.getByRole("dialog", { name: title }).waitFor();
    await assertNoTitleRing(light.frame);
    await light.frame.getByRole("button", { name: keepLabel }).click();
    if ((await light.frame.locator("[data-wc-quit-confirm]").count()) !== 0) {
      throw new Error("pointer after keyboard left the confirm open");
    }
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
    await light.frame.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 700)));
    if (await quitConfirm.isDisabled()) throw new Error("quit confirm stayed disabled after a failed quit");
    await quitConfirm.click();
    const retried = await light.frame.evaluate(() => window.__wcQuitCalls || 0);
    if (retried !== 2) throw new Error(`throwing quit was not clickable again (${retried})`);
    await light.frame.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 700)));
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
    await assertEmbedButtonHeights(dark.frame, "[data-wc-quit-confirm]");
    // Same move as the light card: a click open must not show the title ring. Space below is the keyboard open.
    await assertNoTitleRing(dark.frame);
    await saveShot(dark.page, "confirm-390-dark-pointer.png");
    await saveShot(dark.page, "confirm-390-dark.png");
    await dark.frame.getByRole("button", { name: keepLabel }).click();
    await dark.frame.getByRole("button", { name: quitLabel }).press("Space");
    await dark.frame.getByRole("dialog", { name: title }).waitFor();
    await assertTitleRing(dark.frame);
    await saveShot(dark.page, "confirm-390-dark-keyboard.png");
    await dark.frame.locator("[data-wc-quit-confirm] h3").press("Tab");
    await assertActiveRing(dark.frame, "dark quit confirm");
    await saveShot(dark.page, "confirm-390-dark-focusring.png");
    await dark.frame.getByRole("button", { name: discardLabel }).press("Tab");
    if ((await focusedName(dark.frame)) !== keepLabel) {
      throw new Error(`dark Tab from first left focus on ${await focusedName(dark.frame)}`);
    }
    await dark.frame.getByRole("button", { name: keepLabel }).press("Tab");
    if ((await focusedName(dark.frame)) !== discardLabel) {
      throw new Error(`dark Tab wrap left focus on ${await focusedName(dark.frame)}`);
    }
    await assertActiveRing(dark.frame, "dark tab wrap");
    await dark.frame.getByRole("button", { name: discardLabel }).press("Shift+Tab");
    if ((await focusedName(dark.frame)) !== keepLabel) {
      throw new Error(`dark Shift+Tab wrap left focus on ${await focusedName(dark.frame)}`);
    }
    await assertActiveRing(dark.frame, "dark shift tab wrap");
    await dark.page.close();

    const deleteTitle = localeValue("delete_workout_title");
    const deleteLight = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&card=delete");
    await deleteLight.frame.getByRole("dialog", { name: deleteTitle }).waitFor();
    await assertInPhone(deleteLight.page, deleteLight.frame, "[data-wc-delete-confirm]");
    await assertEmbedButtonHeights(deleteLight.frame, "[data-wc-delete-confirm]");
    await saveShot(deleteLight.page, "delete-390-light.png");
    await deleteLight.page.close();
    const deleteDark = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&dark=1&card=delete");
    await deleteDark.frame.getByRole("dialog", { name: deleteTitle }).waitFor();
    await assertInPhone(deleteDark.page, deleteDark.frame, "[data-wc-delete-confirm]");
    await assertEmbedButtonHeights(deleteDark.frame, "[data-wc-delete-confirm]");
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
    await assertNoTitleRing(history.frame);
    await assertInPhone(history.page, history.frame, "[data-wc-delete-confirm]");
    await history.frame.getByRole("button", { name: cancelLabel }).click();
    if ((await history.frame.locator("[data-wc-delete-confirm]").count()) !== 0) throw new Error("Cancel left the delete card open");
    if ((await focusedName(history.frame)) !== deleteLabel) {
      throw new Error(`Cancel left focus on ${await focusedName(history.frame)}`);
    }
    await historyDelete.press("Enter");
    await history.frame.getByRole("dialog", { name: deleteTitle }).waitFor();
    await assertTitleRing(history.frame);
    await history.frame.getByRole("button", { name: cancelLabel }).click();
    await historyDelete.press("Space");
    await history.frame.getByRole("dialog", { name: deleteTitle }).waitFor();
    await assertTitleRing(history.frame);
    await history.frame.getByRole("button", { name: cancelLabel }).click();
    if ((await focusedName(history.frame)) !== deleteLabel) {
      throw new Error(`keyboard Cancel left focus on ${await focusedName(history.frame)}`);
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

    const historyRows = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&card=history&rows=3");
    historyRows.page.on("dialog", (dialog) => dialog.dismiss());
    const confirmRowDelete = async (rowIndex) => {
      await historyRows.frame.locator("ul").getByRole("button", { name: deleteLabel }).nth(rowIndex).click();
      await historyRows.frame.locator("[data-wc-delete-confirm]").getByRole("button", { name: deleteLabel }).click();
    };
    const waitForRowFocus = async (index, exercise) => {
      try {
        await historyRows.frame.waitForFunction(
          ({ index: rowIndex, exercise: name, label }) => {
            if (document.querySelector("[data-wc-delete-confirm]")) return false;
            const element = document.activeElement;
            if (!element || element === document.body) return false;
            if ((element.getAttribute("aria-label") || "") !== label) return false;
            const items = [...document.querySelectorAll("ul li")];
            const row = items[rowIndex];
            return Boolean(row && row.contains(element) && (row.textContent || "").includes(name));
          },
          { index, exercise, label: deleteLabel },
        );
      } catch (error) {
        const where = await historyRows.frame.evaluate(() => {
          const element = document.activeElement;
          const items = [...document.querySelectorAll("ul li")];
          const rowIndex = items.findIndex((row) => row.contains(element));
          const text = (items[rowIndex]?.textContent || "").replace(/\s+/g, " ").trim();
          return `${element?.tagName || "none"}:${rowIndex}:${text}`;
        });
        throw new Error(`delete focus expected row ${index} ${exercise}, got ${where} (${error.message})`);
      }
    };
    await confirmRowDelete(1);
    await waitForRowFocus(1, "PRESS");
    await confirmRowDelete(1);
    await waitForRowFocus(0, "SQUAT");
    await confirmRowDelete(0);
    try {
      await historyRows.frame.waitForFunction(() => {
        if (document.querySelectorAll("ul li").length !== 0) return false;
        const element = document.activeElement;
        return element?.tagName === "H2" && element.getAttribute("tabindex") === "-1";
      });
    } catch (error) {
      const headingFocus = await historyRows.frame.evaluate(() => document.activeElement?.tagName || "");
      throw new Error(`empty history left focus on ${headingFocus} (${error.message})`);
    }
    await historyRows.page.close();

    const historyFail = await openPhone(browser, parentOrigin, childOrigin, "?embed=1&card=history");
    historyFail.page.on("dialog", (dialog) => dialog.dismiss());
    await historyFail.frame.evaluate(() => {
      window.__wcFailRemove = true;
    });
    await historyFail.frame.locator("ul").getByRole("button", { name: deleteLabel }).first().click();
    await historyFail.frame.locator("[data-wc-delete-confirm]").getByRole("button", { name: deleteLabel }).click();
    try {
      await historyFail.frame.waitForFunction((label) => {
        if (document.querySelector("[data-wc-delete-confirm]")) return false;
        const element = document.activeElement;
        if (!element || element === document.body) return false;
        const items = [...document.querySelectorAll("ul li")];
        return items.length === 2 && items[0]?.contains(element) && (element.getAttribute("aria-label") || "") === label;
      }, deleteLabel);
    } catch (error) {
      throw new Error(`failed delete left focus on ${await focusedName(historyFail.frame)} (${error.message})`);
    }
    await historyFail.frame.evaluate(() => {
      window.__wcSessions = (window.__wcSessions || []).filter((session) => session.id !== "hist-1");
      window.__wcRefetchSessions();
    });
    try {
      await historyFail.frame.waitForFunction(() => {
        if (document.querySelectorAll("ul li").length !== 1) return false;
        return document.activeElement === document.body;
      });
    } catch (error) {
      throw new Error(`failed delete kept a pending focus (${await focusedName(historyFail.frame)}) (${error.message})`);
    }
    await historyFail.page.close();

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

    const programEmbed = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await programEmbed.goto(`${childOrigin}/harness.html?embed=1&card=program`, { waitUntil: "domcontentloaded" });
    await programEmbed.waitForSelector("[data-wc-ready]");
    if ((await programEmbed.evaluate(() => document.documentElement.getAttribute("data-wc-embed"))) !== "1") {
      throw new Error("program embed page did not set data-wc-embed");
    }
    await assertProgramQuit(programEmbed, true);
    await programEmbed.close();
    const programPlain = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await programPlain.goto(`${childOrigin}/harness.html?card=program`, { waitUntil: "domcontentloaded" });
    await programPlain.waitForSelector("[data-wc-ready]");
    if ((await programPlain.evaluate(() => document.documentElement.getAttribute("data-wc-embed"))) !== null) {
      throw new Error("plain program page set data-wc-embed");
    }
    await assertProgramQuit(programPlain, false);
    await programPlain.close();

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
    await runTitleModality(browser, parentOrigin, childOrigin, "chromium", saveShot);
    } catch (error) {
      harnessFailures.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await runWebKitTitleModality(parentOrigin, childOrigin, saveShot);
    } catch (error) {
      harnessFailures.push(error instanceof Error ? error.message : String(error));
    }
    try {
      await runFirefoxThrowingQuit(parentOrigin, childOrigin);
    } catch (error) {
      harnessFailures.push(error instanceof Error ? error.message : String(error));
    }
    if (harnessFailures.length) throw new Error(harnessFailures.join("\n"));
    console.log("embed iframe: quit confirm stays in the 390x844 frame and quit clears the session");
  } finally {
    if (parent) await closeServer(parent);
    if (child) await closeServer(child);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  assertProductionSources();
  assertTrapUsesFocusVisible();
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
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        process.env.CI === "true" ? `chromium is not available in CI (${error.message}).` : `Chromium failed to launch (${error.message}).`,
      );
    }
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
