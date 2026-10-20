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

  const pendingAt = header.indexOf("authChrome === \"pending\"");
  const signedOutAt = header.indexOf("authChrome === \"signed-out\"");
  assert.ok(pendingAt > 0);
  assert.ok(signedOutAt > pendingAt);
  const pending = header.slice(pendingAt, signedOutAt);
  assert.match(pending, /aria-hidden="true"/);
  assert.match(pending, /className=\{`\$\{loginLinkClass\} invisible`\}/);
  assert.match(pending, /className=\{`\$\{publicSignupClass\} invisible`\}/);
  assert.match(pending, /\{loginLabel\}/);
  assert.match(pending, /\{signupLabel\}/);
  assert.doesNotMatch(pending, /<Link/);
  assert.doesNotMatch(pending, /avatar/);
  assert.doesNotMatch(pending, /href=/);
  assert.doesNotMatch(pending, /#[0-9a-fA-F]{3,8}/);
});

test("pending and signed-out auth rows share the wrapping container classes", () => {
  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  const cluster = "ml-1 flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-2";
  assert.match(header, new RegExp(`const authClusterClass = "${cluster}"`));
  assert.equal(header.split("className={authClusterClass}").length - 1, 2);
  const loginClass =
    "!inline-flex !min-h-12 !min-w-12 !shrink-0 items-center justify-center !text-lg !no-underline px-2 text-center";
  assert.equal(header.split(loginClass).length - 1, 2);
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
    "/usr/bin/chromium-browser"
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function quoted(source: string, key: string): string {
  const match = source.match(new RegExp(`${key}:\\s*"([^"]*)"`));
  assert.ok(match, key);
  return match[1];
}

test("pending and signed-out headers take the same box at 320px", async () => {
  const chrome = chromeBinary();
  if (!chrome) return;

  const header = readFileSync("src/features/layout/Header.tsx", "utf8");
  const link = readFileSync("src/components/ui/link.tsx", "utf8");
  const loginLinkClass = readStringConst(header, "loginLinkClass");
  const publicSignupClass = readStringConst(header, "publicSignupClass");
  const authClusterClass = readStringConst(header, "authClusterClass");
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
      "--minify"
    ]);
    const el = (tag: "a" | "span", className: string, label: string, href: string) =>
      tag === "a" ? `<a class="${className}" href="${href}">${label}</a>` : `<span class="${className}">${label}</span>`;
    const cluster = (id: string, login: string, signup: string, tag: "a" | "span") =>
      `<div id="${id}" class="${authClusterClass}">${el(tag, login, "Login", "#login")}${el(tag, signup, "Sign up", "#signup")}</div>`;
    const slot = "<div class=\"inline-flex !min-h-12 !min-w-12 items-center justify-center\"><span class=\"block h-12 w-12\"></span></div>";
    const bar = (id: string, inner: string) =>
      [
        `<div id="${id}" class="navbar h-auto flex-wrap gap-y-2 bg-base-100 px-2 max-sm:shrink-0" style="width:320px">`,
        "<div class=\"navbar-start order-1 !w-auto shrink-0 flex items-center gap-1\"><span class=\"block h-10 w-10\"></span></div>",
        "<div class=\"order-3 flex min-w-0 max-w-full justify-end max-[447px]:basis-full\">",
        "<span class=\"inline-flex min-h-12 items-center\">streak</span></div>",
        "<div class=\"navbar-end order-2 !h-auto !w-auto min-w-0 flex-1 flex-wrap justify-end gap-y-1\">",
        slot,
        slot,
        inner,
        "</div></div>"
      ].join("");
    const pendingCluster = cluster("pending-cluster", `${loginLinkClass} invisible`, `${publicSignupClass} invisible`, "span");
    const signedCluster = cluster("signed-cluster", loginClass, signupClass, "a");
    const html = [
      `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${cssPath}">`,
      "<style>html,body{margin:0;width:320px}:root{--wc-dash-accent:#0a5c52;--wc-dash-ink:#ffffff}</style></head><body>",
      bar("pending", pendingCluster),
      bar("signed", signedCluster),
      "<pre id=\"out\"></pre><script>",
      "function box(id){var r=document.getElementById(id).getBoundingClientRect();",
      "return {w:Math.round(r.width*100)/100,h:Math.round(r.height*100)/100}}",
      "document.getElementById(\"out\").textContent=JSON.stringify({",
      "pending:box(\"pending\"),signed:box(\"signed\"),",
      "pendingCluster:box(\"pending-cluster\"),signedCluster:box(\"signed-cluster\")});",
      "</script></body></html>"
    ].join("");
    writeFileSync(htmlPath, html);
    const dom = await dumpDom(chrome, htmlPath, join(dir, "chrome-profile"));
    const raw = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)?.[1] ?? "";
    const measured = JSON.parse(raw.replace(/&quot;/g, "\"").replace(/&amp;/g, "&")) as {
      pending: { w: number; h: number };
      signed: { w: number; h: number };
      pendingCluster: { w: number; h: number };
      signedCluster: { w: number; h: number };
    };
    const pendingBox = `${measured.pending.w}x${measured.pending.h}`;
    const signedBox = `${measured.signed.w}x${measured.signed.h}`;
    const clusterBox = `${measured.pendingCluster.w}x${measured.pendingCluster.h}`;
    console.log(`320px header box pending ${pendingBox} signed-out ${signedBox} cluster ${clusterBox}`);
    assert.equal(measured.pending.w, 320);
    assert.equal(measured.signed.w, 320);
    assert.ok(measured.pending.h > 0);
    assert.deepEqual(measured.pending, measured.signed);
    assert.deepEqual(measured.pendingCluster, measured.signedCluster);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

function dumpDom(chrome: string, htmlPath: string, profileDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        `--user-data-dir=${profileDir}`,
        "--window-size=320,800",
        "--virtual-time-budget=2000",
        "--dump-dom",
        `file://${htmlPath}`
      ],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] }
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
