import { test } from "node:test";
import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { SignoutPendingNotice } from "./signout-pending-notice";
import { PeptideOsSignoutHandoff } from "./peptideos-signout-handoff";

const ACTION = "https://peptideos.us/api/workouts/signout?redirect=https%3A%2F%2Fworkouts.peptideos.us%2F";
const REDIRECT = "https://workouts.peptideos.us/";

function buttonsOutsideNoscript(html: string): string[] {
  const stripped = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  return stripped.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
}

function isHiddenButton(button: string): boolean {
  const open = button.slice(0, button.indexOf(">") + 1);
  return /\shidden(?:=|\s|>)/.test(open) || /display:\s*none/.test(open);
}

test("auto-submit handoff does not paint a visible sign-out button", () => {
  const html = renderToStaticMarkup(
    createElement(PeptideOsSignoutHandoff, {
      actionUrl: ACTION,
      autoSubmit: true,
      fallbackLabel: "Continue signing out",
      redirect: REDIRECT,
      submitLabel: "Logout"
    })
  );

  assert.match(html, /method="post"/);
  assert.match(html, /name="redirect"/);
  assert.doesNotMatch(html, />Logout</);
  const buttons = buttonsOutsideNoscript(html);
  assert.ok(buttons.length >= 1, "no-JS still needs a submit control in the form");
  assert.ok(buttons.every(isHiddenButton), `visible button flashed:\n${buttons.join("\n")}`);
  assert.match(html, /signout-continue-fallback/);
  assert.match(html, /Continue signing out/);
});

test("pending notice is large status text and a spinner, with no button", () => {
  const html = renderToStaticMarkup(createElement(SignoutPendingNotice, { label: "Signing you out…" }));

  assert.match(html, /<h1[^>]*>Signing you out…<\/h1>/);
  assert.match(html, /role="status"/);
  assert.match(html, /animate-spin/);
  assert.doesNotMatch(html, /<button/i);
  assert.doesNotMatch(html, /Sign out/i);
});

test("confirm handoff keeps a visible submit button when auto-submit is not authorized", () => {
  const html = renderToStaticMarkup(
    createElement(PeptideOsSignoutHandoff, {
      actionUrl: ACTION,
      autoSubmit: false,
      fallbackLabel: "Continue signing out",
      redirect: REDIRECT,
      submitLabel: "Logout"
    })
  );

  const visible = buttonsOutsideNoscript(html).filter((button) => !isHiddenButton(button));
  assert.equal(visible.length, 1);
  assert.match(visible[0], />Logout</);
  assert.doesNotMatch(html, /Continue signing out/);
});
