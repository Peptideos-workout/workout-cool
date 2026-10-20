import { test } from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

test("the streak skeleton uses the resolved day-cell box", () => {
  const source = readFileSync("src/features/layout/workout-streak-header.tsx", "utf8");
  const loadingAt = source.indexOf("if (sessionsLoading)");
  const errorAt = source.indexOf("if (sessionsError)");
  const resolvedAt = source.indexOf("streakData.days.map");
  assert.ok(loadingAt > 0);
  assert.ok(errorAt > loadingAt);
  assert.ok(resolvedAt > errorAt);
  const loading = source.slice(loadingAt, errorAt);
  const resolved = source.slice(resolvedAt);

  assert.match(loading, /flex gap-1 sm:mr-2/);
  assert.match(loading, /h-12 w-12 min-h-12 min-w-12 shrink-0/);
  assert.match(loading, /pointer-events-none h-4 w-4 rounded-sm/);
  assert.match(loading, /sm:h-6 sm:w-6 sm:rounded-md/);
  assert.doesNotMatch(loading, /className="w-4 h-4/);
  assert.equal(source.split("flex gap-1 sm:mr-2").length - 1, 2);
  assert.match(resolved, /h-12 w-12 min-h-12 min-w-12 shrink-0/);
  assert.match(resolved, /pointer-events-none h-4 w-4 rounded-sm/);
  assert.match(resolved, /sm:h-6 sm:w-6 sm:rounded-md/);
  assert.doesNotMatch(source, /useWorkoutSessions\(\{/);
});

test("real streak header has zero layout shift when the session query key changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wc-streak-cls-"));
  const cssPath = join(dir, "streak.css");
  const htmlPath = join(dir, "streak.html");
  const bundlePath = join(dir, "streak.js");
  try {
    writeFileSync(join(dir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
    await run(join(process.cwd(), "node_modules", ".bin", "tailwindcss"), [
      "-c",
      "tailwind.config.ts",
      "-i",
      join(dir, "in.css"),
      "-o",
      cssPath,
      "--minify"
    ]);
    const bundle = await bundleRealStreak(dir);
    writeFileSync(bundlePath, bundle);
    writeHtml(cssPath, bundlePath, htmlPath);
    assert.match(bundle, /Loading workout streak/);
    assert.match(bundle, /workout-sessions/);
    assert.equal(bundle.includes("getWorkoutSessionsAction"), false);
    assert.ok(bundle.split("min-h-12 min-w-12").length - 1 >= 2);

    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const widths = [320, 375, 768];
      const modes = ["signed-in", "signed-out"] as const;
      for (const width of widths) {
        for (const mode of modes) {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
          const measured = (await page.evaluate(measureScript(mode))) as StreakMeasure;
          const beforeBox = `${measured.before.w}x${measured.before.h}`;
          const midBox = `${measured.mid.w}x${measured.mid.h}`;
          const afterBox = `${measured.after.w}x${measured.after.h}`;
          console.log(`${measured.width}px ${mode} before ${beforeBox} mid ${midBox} after ${afterBox}`);
          console.log(`${measured.width}px ${mode} below ${measured.belowDelta} cls ${measured.cls}`);
          console.log(`${measured.width}px ${mode} fetches ${JSON.stringify(measured.fetches)}`);
          assert.deepEqual(errors, [], errors.join("\n"));
          assert.equal(measured.before.h, 48);
          assert.equal(measured.mid.h, 48);
          assert.equal(measured.after.h, 48);
          assert.equal(measured.before.cellH, 48);
          assert.equal(measured.mid.cellH, 48);
          assert.equal(measured.after.cellH, 48);
          assert.equal(measured.belowDelta, 0);
          assert.equal(measured.cls, 0);
          assert.equal(measured.sawLoading, true);
          assert.match(measured.loadingClass, /h-12 w-12 min-h-12 min-w-12/);
          assert.match(measured.resolvedClass, /h-12 w-12 min-h-12 min-w-12/);
          if (mode === "signed-in") {
            assert.deepEqual(measured.fetches, [null, "user-1"]);
            assert.ok(measured.keys.some((key) => key[0] === "workout-sessions" && key[1] === null));
            assert.ok(measured.keys.some((key) => key[0] === "workout-sessions" && key[1] === "user-1"));
          } else {
            assert.deepEqual(measured.fetches, [null]);
            assert.ok(measured.keys.every((key) => key[1] === null));
          }
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface StreakBox {
  w: number;
  h: number;
  cellH: number;
}

interface StreakMeasure {
  width: number;
  before: StreakBox;
  mid: StreakBox;
  after: StreakBox;
  belowDelta: number;
  cls: number;
  fetches: Array<string | null>;
  keys: Array<[string, string | null]>;
  sawLoading: boolean;
  loadingClass: string;
  resolvedClass: string;
}

async function bundleRealStreak(dir: string): Promise<string> {
  const authPath = join(dir, "auth-session.ts");
  const servicePath = join(dir, "session-service.ts");
  const localePath = join(dir, "locale-client.ts");
  const harnessPath = join(dir, "harness.tsx");
  const outfile = join(dir, "streak.js");
  writeFileSync(authPath, AUTH_STUB);
  writeFileSync(servicePath, SERVICE_STUB);
  writeFileSync(localePath, LOCALE_STUB);
  writeFileSync(
    harnessPath,
    `import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import WorkoutStreakHeader from ${JSON.stringify(join(process.cwd(), "src/features/layout/workout-streak-header.tsx"))};
import { useWorkoutSessions } from ${JSON.stringify(join(process.cwd(), "src/features/workout-session/model/use-workout-sessions.ts"))};

function readKeys(client) {
  return client.getQueryCache().getAll().map((entry) => entry.queryKey.map((part) => (part === undefined ? null : part)));
}

function QueryKeyProbe() {
  const client = useQueryClient();
  const query = useWorkoutSessions();
  useEffect(() => {
    const publish = () => {
      window.__queryKeys = readKeys(client);
      window.__streakQuery = { isLoading: query.isLoading, status: query.status, fetchStatus: query.fetchStatus };
    };
    publish();
    return client.getQueryCache().subscribe(publish);
  }, [client, query.isLoading, query.status, query.fetchStatus]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false } }
});
window.__readKeys = () => readKeys(queryClient);

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <QueryKeyProbe />
    <WorkoutStreakHeader />
  </QueryClientProvider>
);
`
  );
  const esbuild = loadEsbuild();
  await esbuild.build({
    absWorkingDir: process.cwd(),
    nodePaths: [join(process.cwd(), "node_modules")],
    entryPoints: [harnessPath],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    outfile,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": "\"development\"" },
    banner: { js: "var process = window.process || { env: { NODE_ENV: 'development' } };" },
    plugins: [
      {
        name: "wc-streak-aliases",
        setup(build: EsbuildSetup) {
          build.onResolve({ filter: /.*/ }, (args: { path: string }) => {
            if (args.path === "@/features/auth/lib/auth-client") return { path: authPath };
            if (args.path === "@/shared/lib/workout-session/use-workout-session.service") return { path: servicePath };
            if (args.path === "locales/client") return { path: localePath };
            if (args.path.startsWith("@/")) {
              const resolved = resolveSrc(args.path);
              if (!resolved) return { errors: [{ text: `Cannot resolve ${args.path}` }] };
              return { path: resolved };
            }
            return null;
          });
        }
      }
    ]
  });
  return readFileSync(outfile, "utf8");
}

function resolveSrc(spec: string): string | null {
  const base = join(process.cwd(), "src", spec.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function loadEsbuild(): { build: (options: Record<string, unknown>) => Promise<void> } {
  const root = join(process.cwd(), "node_modules", ".pnpm");
  const dir = readdirSync(root).find((name) => name.startsWith("esbuild@"));
  if (!dir) throw new Error("esbuild is not installed");
  const require = createRequire(import.meta.url);
  return require(join(root, dir, "node_modules", "esbuild", "lib", "main.js"));
}

function measureScript(mode: "signed-in" | "signed-out"): string {
  return `(() => {
    var mode = ${JSON.stringify(mode)};
    var frame = function () {
      return new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
    };
    var labelOf = function () {
      var row = document.querySelector("#root [aria-label]");
      return row ? row.getAttribute("aria-label") || "" : "";
    };
    var rowOf = function () {
      return document.querySelector("#root [aria-label]");
    };
    var box = function () {
      var row = rowOf();
      var rect = row.getBoundingClientRect();
      var cell = row.querySelector(":scope > div");
      var cellRect = cell ? cell.getBoundingClientRect() : { height: 0 };
      return {
        w: Math.round(rect.width * 100) / 100,
        h: Math.round(rect.height * 100) / 100,
        cellH: Math.round(cellRect.height * 100) / 100
      };
    };
    var cellClass = function () {
      var row = rowOf();
      var cell = row && row.querySelector(":scope > div");
      return cell ? cell.className : "";
    };
    var waitFor = function (pred) {
      var start = performance.now();
      return new Promise(function (resolve, reject) {
        var tick = function () {
          if (pred()) { resolve(); return; }
          if (performance.now() - start > 4000) {
            reject(new Error(
              "timeout label=" + labelOf() +
              " fetches=" + JSON.stringify(window.__streakFetches) +
              " keys=" + JSON.stringify(window.__readKeys())
            ));
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });
    };
    var isLoading = function () { return labelOf() === "Loading workout streak"; };
    var isResolved = function () { return labelOf().indexOf("Workout streak:") === 0; };
    return frame().then(function () {
      return waitFor(isLoading).then(function () {
        var run = mode === "signed-in" ? measureSignedIn() : measureSignedOut();
        return run;
      });
    });
    function measureSignedIn() {
      window.__releaseStreakFetch();
      return waitFor(isResolved).then(frame).then(function () {
        return observe(function () {
          window.__setSession({ data: { user: { id: "user-1" } }, isPending: false });
          return waitFor(isLoading).then(frame);
        });
      });
    }
    function measureSignedOut() {
      return observe(function () {
        window.__setSession({ data: null, isPending: false });
        return frame().then(function () {
          if (!isLoading()) throw new Error("signed-out left the loading row early: " + labelOf());
        });
      });
    }
    function observe(change) {
      var score = 0;
      var sawLoading = isLoading();
      var loadingClass = "";
      var obs = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (!entry.hadRecentInput) score += entry.value;
        });
      });
      obs.observe({ type: "layout-shift", buffered: false });
      var before = box();
      var below = document.getElementById("below").getBoundingClientRect().top;
      return change().then(function () {
        if (isLoading()) {
          sawLoading = true;
          loadingClass = cellClass();
        }
        var mid = box();
        window.__releaseStreakFetch();
        return waitFor(isResolved).then(frame).then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 50); });
        }).then(function () {
          obs.disconnect();
          var after = box();
          return {
            width: window.innerWidth,
            before: before,
            mid: mid,
            after: after,
            belowDelta: Math.round((document.getElementById("below").getBoundingClientRect().top - below) * 100) / 100,
            cls: score,
            fetches: window.__streakFetches.slice(),
            keys: window.__readKeys(),
            sawLoading: sawLoading,
            loadingClass: loadingClass,
            resolvedClass: cellClass()
          };
        });
      });
    }
  })()`;
}

const AUTH_STUB = `import { useSyncExternalStore } from "react";

var value = { data: null, isPending: true };
var listeners = new Set();

function emit() {
  listeners.forEach(function (listener) { listener(); });
}

export function useSession() {
  return useSyncExternalStore(
    function (listener) {
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    },
    function () { return value; },
    function () { return value; }
  );
}

window.__streakFetches = [];
window.__streakQueue = [];
window.__setSession = function (next) {
  value = next;
  emit();
};
window.__releaseStreakFetch = function () {
  var release = window.__streakQueue.shift();
  if (release) release();
};
`;

const SERVICE_STUB = `import { useSession } from "@/features/auth/lib/auth-client";

export function useWorkoutSessionService() {
  var session = useSession();
  var userId = session.data && session.data.user ? session.data.user.id : undefined;
  return {
    getAll: function () {
      window.__streakFetches.push(userId === undefined ? null : userId);
      return new Promise(function (resolve) {
        window.__streakQueue.push(function () { resolve([]); });
      });
    }
  };
}
`;

const LOCALE_STUB = `export function useCurrentLocale() {
  return "en";
}
`;

interface EsbuildSetup {
  onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

function writeHtml(cssPath: string, bundlePath: string, htmlPath: string) {
  const html = [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<link rel="stylesheet" href="${cssPath}">`,
    "<style>html,body{margin:0;padding:0}</style></head><body>",
    "<div id=\"root\"></div><div id=\"below\">below</div>",
    `<script src="${bundlePath}"></script>`,
    "</body></html>"
  ].join("");
  writeFileSync(htmlPath, html);
}
