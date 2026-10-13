import { test } from "node:test";
import assert from "node:assert/strict";

import { embedSsoFallbackLinks, prefersBrowserSsoErrorPage, ssoErrorCopy, ssoErrorHtml } from "./sso-error-page";

test("browser navigations prefer an HTML SSO error page", () => {
  assert.equal(prefersBrowserSsoErrorPage("text/html,application/xhtml+xml"), true);
  assert.equal(prefersBrowserSsoErrorPage("text/html"), true);
  assert.equal(prefersBrowserSsoErrorPage("application/json"), false);
  assert.equal(prefersBrowserSsoErrorPage("*/*"), false);
  assert.equal(prefersBrowserSsoErrorPage(null), false);
  assert.equal(prefersBrowserSsoErrorPage(undefined), false);
});

test("SSO error copy includes a try-again label and a 409 support note", () => {
  const generic = ssoErrorCopy("en", "invalid_or_expired_handoff");
  assert.match(generic.title, /could not sign you in|sign-in failed/i);
  assert.match(generic.tryAgain, /try again/i);
  assert.equal(generic.supportNote, undefined);

  const collision = ssoErrorCopy("en", "sso_email_collision");
  assert.ok(collision.supportNote);
  assert.match(collision.supportNote, /support/i);
  assert.doesNotMatch(collision.supportNote, /@/);
});

test("SSO error HTML links to PeptideOS workouts SSO and stays generic", () => {
  const html = ssoErrorHtml({
    locale: "en",
    error: "sso_email_collision",
    tryAgainHref: "https://peptideos.us/api/workouts/sso"
  });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /href="https:\/\/peptideos\.us\/api\/workouts\/sso"/);
  assert.match(html, /Try again/i);
  assert.match(html, /support/i);
  assert.doesNotMatch(html, /athlete@example/);
  assert.doesNotMatch(html, /sso_email_collision/);
  assert.doesNotMatch(html, /← Back to dashboard/);
  assert.doesNotMatch(html, /target="_top"/);
});

test("embed SSO errors, including forbidden origin, break Log in and Sign up out of the frame", () => {
  for (const error of ["forbidden_origin", "sso_signin_failed", "invalid_or_expired_handoff"]) {
    const html = ssoErrorHtml({
      locale: "en",
      error,
      tryAgainHref: "https://peptideos.us/api/workouts/sso?redirect=https%3A%2F%2Fworkouts.peptideos.us%2F",
      embed: true
    });
    assert.match(html, />Log in</);
    assert.match(html, />Sign up</);
    assert.match(html, /← Back to dashboard/);
    assert.doesNotMatch(html, /forbidden_origin|sso_signin_failed|invalid_or_expired_handoff/);
    const links = embedSsoFallbackLinks("https://peptideos.us/api/workouts/sso?redirect=https%3A%2F%2Fworkouts.peptideos.us%2F");
    for (const href of [links.loginHref, links.signupHref, links.dashboardHref]) {
      const tag = html.match(new RegExp(`<a href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`));
      assert.ok(tag, `${error} ${href}`);
      assert.match(tag[0], /target="_top"/);
      assert.doesNotMatch(tag[0], /target="_blank"|target="_self"/);
    }
    assert.equal(links.signupHref, "https://peptideos.us/signup");
    assert.equal(links.dashboardHref, "https://peptideos.us/dashboard");
  }
});
