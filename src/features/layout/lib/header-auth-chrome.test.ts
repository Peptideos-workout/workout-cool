import { test } from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

import { HEADER_AUTH_PENDING_TIMEOUT_MS, headerAuthChrome } from "./header-auth-chrome";

import { cn } from "@/shared/lib/utils";

test("header auth chrome is neutral while the session is pending and unchanged after", () => {
  assert.equal(headerAuthChrome(true, false), "pending");
  assert.equal(headerAuthChrome(true, true), "signed-in");
  assert.equal(headerAuthChrome(false, false), "signed-out");
  assert.equal(headerAuthChrome(false, true), "signed-in");
});

test("a session-less pending header falls back to signed-out after the timeout", () => {
  assert.equal(HEADER_AUTH_PENDING_TIMEOUT_MS, 8000);
  assert.equal(headerAuthChrome(true, false, false), "pending");
  assert.equal(headerAuthChrome(true, false, true), "signed-out");
  assert.equal(headerAuthChrome(true, true, true), "signed-in");
  assert.equal(headerAuthChrome(false, false, true), "signed-out");

  const hook = readFileSync("src/features/layout/lib/use-header-auth-timeout.ts", "utf8");
  assert.match(hook, /HEADER_AUTH_PENDING_TIMEOUT_MS/);
  assert.match(hook, /setTimeout/);
  assert.match(hook, /clearTimeout\(timeoutId\)/);
  assert.match(hook, /if \(!isPending \|\| hasSession\)/);

  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  assert.match(header, /useHeaderAuthTimedOut\(session\.isPending, hasSession\)/);
  assert.match(header, /headerAuthChrome\(session\.isPending, hasSession, authTimedOut\)/);
});

test("the pending header slot reserves the auth footprint without login, signup, or avatar", () => {
  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  assert.match(header, /headerAuthChrome\(session\.isPending, hasSession, authTimedOut\)/);
  assert.match(header, /data-wc-header-auth=\{authChrome\}/);
  assert.match(header, /\[grid-template-areas:'auth'\]/);
  assert.equal(header.split("[grid-area:auth]").length - 1, 2);

  const signedOutAt = header.indexOf("authChrome === \"signed-out\" ? (");
  const accountAt = header.indexOf("const authAccountClass");
  assert.ok(signedOutAt > 0);
  const footprint = header.slice(signedOutAt);
  const placeholderAt = footprint.indexOf(") : (");
  assert.ok(placeholderAt > 0);
  const placeholder = footprint.slice(placeholderAt, footprint.indexOf("authAccountClass", placeholderAt));
  assert.match(header, /aria-hidden=\{authChrome === "signed-out" \? undefined : true\}/);
  assert.match(header, /aria-hidden=\{authChrome === "signed-in" \? undefined : true\}/);
  assert.match(placeholder, /className=\{`\$\{loginLinkClass\} invisible`\}/);
  assert.match(placeholder, /className=\{`\$\{publicSignupClass\} invisible`\}/);
  assert.match(placeholder, /\{loginLabel\}/);
  assert.match(placeholder, /\{signupLabel\}/);
  assert.doesNotMatch(placeholder, /<Link/);
  assert.doesNotMatch(placeholder, /href=/);
  assert.doesNotMatch(placeholder, /role="button"/);
  assert.doesNotMatch(placeholder, /#[0-9a-fA-F]{3,8}/);
  assert.ok(accountAt > 0);
  const spacerAt = header.indexOf("<span className={avatarButtonClass} />");
  assert.ok(spacerAt > signedOutAt);
  const beforeSpacer = header.slice(Math.max(0, spacerAt - 48), spacerAt);
  assert.match(beforeSpacer, /\) : \(\s*$/);
  assert.doesNotMatch(header.slice(spacerAt, spacerAt + 80), /<Link|href=|role="button"/);
  const signedInAt = header.lastIndexOf("authChrome === \"signed-in\"", spacerAt);
  assert.ok(signedInAt > 0);
  assert.match(header.slice(signedInAt, spacerAt), /role="button"/);
});

test("pending and signed-out auth rows share the wrapping container classes", () => {
  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  const cluster = "ml-1 flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-2 [grid-area:auth]";
  assert.ok(header.includes(`const authClusterClass = "${cluster}"`));
  assert.equal(header.split("authClusterClass}").length - 1, 1);
  const loginClass = "!inline-flex !min-h-12 !min-w-12 !shrink-0 items-center justify-center !text-lg !no-underline px-2 text-center";
  assert.equal(header.split(loginClass).length - 1, 2);
  assert.match(header, /const authHiddenClass = "invisible pointer-events-none"/);
  assert.match(header, /const avatarButtonClass = "btn btn-ghost btn-circle avatar relative !min-h-12 !min-w-12"/);
});

function readStringConst(source: string, name: string): string {
  const start = source.indexOf(`const ${name} =`);
  assert.ok(start > 0, name);
  const end = source.indexOf(";\n", start);
  const body = source.slice(start, end);
  return [...body.matchAll(/"([^"]*)"/g)].map((match) => match[1]).join("");
}

function chromeBinary(): string | null {
  const candidates = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function quoted(source: string, key: string): string {
  const match = source.match(new RegExp(`${key}:\\s*"([^"]*)"`));
  assert.ok(match, key);
  return match[1];
}

test("pending, signed-in, and signed-out headers keep one box at 320, 375, and 768", async () => {
  const chrome = chromeBinary();
  if (!chrome) return;

  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  const link = readFileSync("src/components/ui/link.tsx", "utf8");
  const loginLinkClass = readStringConst(header, "loginLinkClass");
  const publicSignupClass = readStringConst(header, "publicSignupClass");
  const authClusterClass = readStringConst(header, "authClusterClass");
  const authSlotClass = readStringConst(header, "authSlotClass");
  const authAccountClass = readStringConst(header, "authAccountClass");
  const authHiddenClass = readStringConst(header, "authHiddenClass");
  const avatarButtonClass = readStringConst(header, "avatarButtonClass");
  const loginClass = cn(quoted(link, "nav"), quoted(link, "sm"), loginLinkClass);
  const signupClass = cn(quoted(link, "button"), quoted(link, "lg"), publicSignupClass);
  const dir = mkdtempSync(join(tmpdir(), "wc-header-box-"));
  const cssPath = join(dir, "header.css");
  const htmlPath = join(dir, "header.html");
  try {
    writeFileSync(join(dir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
    await run(join(process.cwd(), "node_modules", ".bin", "tailwindcss"), [
      "-c",
      "tailwind.config.ts",
      "-i",
      join(dir, "in.css"),
      "-o",
      cssPath,
      "--minify",
    ]);
    const footprint = (mode: string) => {
      const hidden = mode === "signed-out" ? "" : ` ${authHiddenClass}`;
      const inner =
        mode === "signed-out"
          ? `<a class="${loginClass}" href="#login">Login</a><a class="${signupClass}" href="#signup">Sign up</a>`
          : `<span class="${loginLinkClass} invisible">Login</span><span class="${publicSignupClass} invisible">Sign up</span>`;
      return `<div class="${authClusterClass}${hidden}">${inner}</div>`;
    };
    const account = (mode: string) => {
      const hidden = mode === "signed-in" ? "" : ` ${authHiddenClass}`;
      const inner =
        mode === "signed-in"
          ? `<div class="${avatarButtonClass}" role="button" tabindex="0"></div><ul class="dropdown-content menu"><li>Profile</li></ul>`
          : `<span class="${avatarButtonClass}"></span>`;
      return `<div class="${authAccountClass}${hidden}">${inner}</div>`;
    };
    const slotHtml = (mode: string) =>
      `<div class="${authSlotClass}" data-wc-header-auth="${mode}">${footprint(mode)}${account(mode)}</div>`;
    const widths = [320, 375, 768];
    const html = [
      "<!doctype html><html><head><meta charset=\"utf-8\">",
      `<link rel="stylesheet" href="${cssPath}">`,
      "<style>html,body{margin:0}:root{--wc-dash-accent:#0a5c52;--wc-dash-ink:#ffffff}</style></head><body>",
      "<div id=\"viewport\">",
      "<div id=\"header\" class=\"navbar h-auto flex-wrap gap-y-2 bg-base-100 px-2 max-sm:shrink-0\">",
      "<div class=\"navbar-start order-1 !w-auto shrink-0 flex items-center gap-1\"><span class=\"block h-10 w-10\"></span></div>",
      "<div class=\"order-3 flex min-w-0 max-w-full justify-end max-[447px]:basis-full min-[448px]:order-2\">",
      "<span class=\"inline-flex min-h-12 items-center\">streak</span></div>",
      "<div class=\"navbar-end order-2 !h-auto !w-auto min-w-0 flex-1 flex-wrap justify-end gap-y-1 min-[448px]:order-3\">",
      "<div class=\"inline-flex !min-h-12 !min-w-12 items-center justify-center\"><span class=\"block h-12 w-12\"></span></div>",
      "<div class=\"inline-flex !min-h-12 !min-w-12 items-center justify-center\"><span class=\"block h-12 w-12\"></span></div>",
      `<div id="auth">${slotHtml("pending")}</div>`,
      "</div></div><div id=\"below\">below</div></div>",
      "<pre id=\"out\"></pre><script>",
      `var slots=${JSON.stringify({
        pending: slotHtml("pending"),
        "signed-in": slotHtml("signed-in"),
        "signed-out": slotHtml("signed-out"),
      })};`,
      `var widths=${JSON.stringify(widths)};`,
      "function box(id){var r=document.getElementById(id).getBoundingClientRect();",
      "return {w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100,top:Math.round(r.top*100)/100}}",
      "function paint(mode){document.getElementById('auth').innerHTML=slots[mode];}",
      "window.__paint=paint;window.__box=box;",
      "if(location.hash!=='#manual'){",
      "var results=[];",
      "widths.forEach(function(width){",
      "document.getElementById('viewport').style.width=width+'px';",
      "paint('pending');var pending=box('header');var below=box('below').top;",
      "paint('signed-in');var signedIn=box('header');var belowIn=box('below').top;",
      "paint('pending');var pendingAgain=box('header');var belowBeforeOut=box('below').top;",
      "paint('signed-out');var signedOut=box('header');var belowOut=box('below').top;",
      "results.push({width:width,pending:pending,signedIn:signedIn,signedOut:signedOut,pendingAgain:pendingAgain,",
      "belowDeltaIn:Math.round((belowIn-below)*100)/100,belowDeltaOut:Math.round((belowOut-belowBeforeOut)*100)/100});",
      "});",
      "document.getElementById('out').textContent=JSON.stringify(results);}",
      "</script></body></html>",
    ].join("");
    writeFileSync(htmlPath, html);
    const dom = await dumpDom(chrome, htmlPath, join(dir, "chrome-profile"), 1024);
    const raw = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)?.[1] ?? "";
    const measured = JSON.parse(raw.replace(/&quot;/g, "\"").replace(/&amp;/g, "&")) as Array<{
      width: number;
      pending: { w: number; h: number };
      signedIn: { w: number; h: number };
      signedOut: { w: number; h: number };
      pendingAgain: { w: number; h: number };
      belowDeltaIn: number;
      belowDeltaOut: number;
    }>;
    assert.equal(measured.length, 3);
    for (const row of measured) {
      const pendingBox = `${row.pending.w}x${row.pending.h}`;
      const signedInBox = `${row.signedIn.w}x${row.signedIn.h}`;
      const signedOutBox = `${row.signedOut.w}x${row.signedOut.h}`;
      console.log(`${row.width}px header pending ${pendingBox} signed-in ${signedInBox} signed-out ${signedOutBox}`);
      console.log(`${row.width}px below delta in ${row.belowDeltaIn} out ${row.belowDeltaOut}`);
      assert.equal(row.pending.w, row.width);
      assert.ok(row.pending.h > 0);
      assert.deepEqual(row.signedIn, row.pending);
      assert.deepEqual(row.signedOut, row.pending);
      assert.deepEqual(row.pendingAgain, row.pending);
      assert.equal(row.belowDeltaIn, 0);
      assert.equal(row.belowDeltaOut, 0);
    }
    const cls = await measureHeaderCls(htmlPath);
    if (cls) {
      for (const row of cls) {
        console.log(`${row.width}px cls pending->signed-in ${row.clsIn} pending->signed-out ${row.clsOut}`);
        assert.equal(row.clsIn, 0);
        assert.equal(row.clsOut, 0);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function measureHeaderCls(htmlPath: string): Promise<Array<{ width: number; clsIn: number; clsOut: number }> | null> {
  let browser: import("playwright").Browser | null = null;
  try {
    const playwright = await import("playwright");
    browser = await playwright.chromium.launch({ headless: true });
  } catch {
    return null;
  }
  if (!browser) return null;
  try {
    const page = await browser.newPage();
    const rows: Array<{ width: number; clsIn: number; clsOut: number }> = [];
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`file://${htmlPath}#manual`, { waitUntil: "load" });
      const measured = (await page.evaluate(`(() => {
          var viewport = ${width};
          var frame = function () {
            return new Promise(function (resolve) {
              requestAnimationFrame(function () { requestAnimationFrame(resolve); });
            });
          };
          var watch = function () {
            var score = 0;
            var obs = new PerformanceObserver(function (list) {
              list.getEntries().forEach(function (entry) {
                if (!entry.hadRecentInput) score += entry.value;
              });
            });
            obs.observe({ type: "layout-shift", buffered: false });
            return function () { obs.disconnect(); return score; };
          };
          document.getElementById("viewport").style.width = viewport + "px";
          return frame().then(function () {
            window.__paint("pending");
            return frame();
          }).then(function () {
            var stopIn = watch();
            window.__paint("signed-in");
            return frame().then(function () { return stopIn(); });
          }).then(function (clsIn) {
            window.__paint("pending");
            return frame().then(function () { return clsIn; });
          }).then(function (clsIn) {
            var stopOut = watch();
            window.__paint("signed-out");
            return frame().then(function () {
              return { width: viewport, clsIn: clsIn, clsOut: stopOut() };
            });
          });
        })()`)) as { width: number; clsIn: number; clsOut: number };
      rows.push(measured);
    }
    return rows;
  } finally {
    await browser.close();
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

function dumpDom(chrome: string, htmlPath: string, profileDir: string, windowWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--force-device-scale-factor=1",
        `--user-data-dir=${profileDir}`,
        `--window-size=${windowWidth},900`,
        "--virtual-time-budget=8000",
        "--dump-dom",
        `file://${htmlPath}`,
      ],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    let settled = false;
    const stop = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop();
      if (error) reject(error);
      else resolve(out);
    };
    const timer = setTimeout(() => finish(new Error("chrome dump timed out")), 20000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes("</pre>")) finish();
    });
    child.on("error", (error) => finish(error));
    child.on("close", () => {
      if (out.includes("</pre>")) finish();
    });
  });
}
