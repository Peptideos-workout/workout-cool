# PeptideOS as the only sign-up and sign-in

Workout-cool is reachable only through PeptideOS. New users register on PeptideOS (`https://peptideos.us/signup`). Existing users sign in on PeptideOS; after login, PeptideOS `/api/workouts/sso` (which sends signed-out users to `/login?next=/workouts`) launches workout-cool via `/api/peptideos-wc-sso`.

All current WC users have a `wc.account` row with `providerId = "peptideos"`. Direct email/password and Google sign-in are disabled.

## What is redirected vs blocked

| Surface | Behavior |
|---|---|
| Signed-out visitor on a **gated** app page | **HTTP 307** from `proxy.ts` to PeptideOS `/api/workouts/sso` (SSO launcher). Optional `?redirect=` is a safe same-origin workout-cool URL (fail closed). |
| Signed-out visitor on a **public marketing** page | **Renders**. Header Sign in / Sign up CTAs go to PeptideOS `/login` and `/signup`. |
| `/auth/signin` and `/auth/signup` pages, workout-cool login/register forms | **Removed**. Those leftover paths are gated (307 to PeptideOS SSO). |
| `signUpAction` server action | **Blocked** (`public_signup_disabled`) |
| `POST /api/auth/signup` | **Blocked** `403` + `{ error, redirectTo }` |
| Better Auth HTTP `POST /api/auth/sign-up/email` and `/api/auth/admin/create-user` | **Blocked** `403` + `{ error, redirectTo }` |
| Better Auth HTTP email/Google sign-in (`/sign-in`, `/sign-in/email`, `/sign-in/social`) and OAuth callback (`/callback/google`) | **Blocked** `403` + `{ error, redirectTo }` (`public_signin_disabled`). Google social provider is `enabled: false`. |
| Better Auth HTTP path that is still encoded after 8 decode rounds, or has malformed `%` | **Blocked** same `403` (fail closed — never forwarded to Better Auth) |
| Better Auth HTTP forget/reset | **Disabled** generic `200` + `{ ok, redirectTo }` pointing at PeptideOS `/forgot-password`. |
| Google OAuth `disableSignUp` / `disableImplicitSignUp` plus `databaseHooks.user.create` | **Blocked** unless the in-process SSO ALS flag is set |
| `databaseHooks.account.create` for `providerId: "credential"` | **Blocked** unless the in-process SSO ALS flag is set |
| `/api/peptideos-wc-sso` create-user (`runWithSsoUserCreate(() => auth.api.signUpEmail(...))`) | **Allowed** — this PR does not edit that route |
| Change-password | PeptideOS `/settings#password` only, when the linked account has an email identity. Legacy local `PasswordForm` and `PUT /api/user/password` are removed. |
| `/auth/link-peptideos` | **Not allowlisted.** PR #3 is deferred; email collisions in SSO stay `409` and go to support. |

After PeptideOS SSO, `finalizeSession` honours the untrusted `redirect` query on `/api/peptideos-wc-sso` only when it is a same-origin workout-cool URL (`safeWorkoutReturnTo`: loop-decode, reject `\`, `%5c`, `//`, userinfo, and control chars). Anything else fails closed to `/`.

PeptideOS `GET /api/workouts/sso?redirect=<absolute WC URL>` preserves that redirect through login and passes it back on the WC SSO handoff. The proxy 307 for gated routes sends `?redirect=<original absolute WC URL, path+query>` with `Cache-Control: private, no-store`.

WC sign-out clears the Better Auth session, then redirects to PeptideOS `GET /api/workouts/signout?redirect=<WC home>`. WC home is public, so PeptideOS cannot bounce the browser back into `/api/workouts/sso`.

GET `/api/programs/[slug]/sessions/[sessionSlug]` is **gated** (401 without a session). It returns published program session catalog (exercises, videos, suggested sets), not user progress. The matching page is already gated.

`robots.ts` and `sitemap.ts` use `https://workouts.peptideos.us` from `NEXT_PUBLIC_APP_URL` (`workoutCoolPublicOrigin`). Robots disallows both `/programs/*/session/` and `/*/programs/*/session/`. The sitemap includes unprefixed `/programs` and `/programs/[slug]` and still omits session URLs.

## Signed-out allowlist

`proxy.ts` matcher already skips `api`, `_next`, static assets, `robots.txt`, and `sitemap.xml`. The signed-out gate still allowlists these explicitly, plus:

- `/auth/signout` (any locale prefix)
- `/api/peptideos-wc-sso` and subpaths
- `/api/health`
- `/api/webhooks/*`
- `/api/auth/*` (sign-in/sign-up/reset still blocked in the Better Auth catch-all)
- `/legal/*` (privacy, terms, sales-terms)

Landing and marketing/info pages stay **public and indexable**. PeptideOS login is required only for the app itself (profile, statistics, program sessions, onboarding, admin, leftover WC auth pages, and anything that reads or writes user data).

### Public vs gated routes

**Public (signed-out visitors render the page; sitemap includes them):**

- `/` (landing / workout builder browse)
- `/about`
- `/tools` and `/tools/*` (calculators)
- `/programs` (catalog)
- `/programs/[slug]` (program detail, no session)
- `/premium`
- `/leaderboard`
- `/legal/*`
- robots, sitemap, assets, `/auth/signout`, SSO/health/webhooks/`/api/auth/*`

**Gated (signed-out visitors get HTTP 307 to PeptideOS SSO):**

- `/profile`
- `/statistics`
- `/programs/[slug]/session/[sessionSlug]`
- `/onboarding`, `/sponsor/onboarding`
- `/admin/*`
- leftover WC auth pages (`/auth/signin`, `/auth/signup`, `/auth/verify-email`, `/auth/verify-request`, `/auth/error`)
- `/auth/link-peptideos` (not allowlisted; PR #3 is deferred)

`robots.ts` disallows the gated prefixes (including locale variants, unprefixed `/programs/*/session/`, and `/*/programs/*/session/`). The sitemap omits session, profile, and statistics URLs.

`/auth/link-peptideos` is not on the allowlist.

Locale prefixes are matched case-insensitively (`/zh-cn`, `/zh-CN`, `/ZH-CN`).

## Unique `(userId, providerId)`

`wc.account` has `@@unique([providerId, accountId])` (one PeptideOS user cannot link to two WC users) and a schema-only `@@unique([userId, providerId], map: "account_userId_providerId_key")` so one WC user cannot have two rows for the same provider.

The index name matches PeptideOS PR #35 / `docs/sql/account-user-provider-unique.sql`. **No Prisma migration is added** — `prisma migrate` must not recreate the live index. If you run `prisma migrate deploy` (`.github/workflows/migrate-wc.yml` / `pnpm db:migrate:direct`), baseline or `prisma migrate resolve` the drift so migrate does not try to `CREATE UNIQUE INDEX "account_userId_providerId_key"`.

Standalone SQL (already applied on PeptideOS, kept for rollback/docs): `docs/sql/account-user-provider-unique.sql`. Rollback: `docs/sql/account-user-provider-unique.rollback.sql`.

## PeptideOS #32 provisioning / sync

This agent could not read `Peptideos-workout/PeptideOS` (repo 404 from this environment). On that side, the `auth.users` trigger, `wc.backfill_peptideos_accounts`, and the reconcile cron should insert `wc.account` with `ON CONFLICT ("userId", "providerId") DO NOTHING` (or equivalent) **and** keep the existing unique `(providerId, accountId)` so a PeptideOS hid cannot attach to a second WC user. Apply the WC unique index before relying on those paths to stay one-to-one.

## PeptideOS URL

Do not invent a required env (that would fail Vercel builds). This repo already uses `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` as the workout origin (`https://workouts.peptideos.us`). PeptideOS already has the reverse pointer `NEXT_PUBLIC_WORKOUT_COOL_URL`.

Optional `NEXT_PUBLIC_PEPTIDEOS_URL` is the reverse of that pairing. If unset and the app host is `workouts.<apex>`, origin is `https://<apex>`. Otherwise `https://peptideos.us`.

SSO launcher path is `/api/workouts/sso` (PeptideOS then sends signed-out users to `/login?next=/workouts`).

## Security invariants (PRs #1 and #2)

- No account takeover by email match: SSO still rejects unless a `peptideos` account already links that PeptideOS user id. Google account linking by email is disabled.
- New SSO users still get a random unused password; sign-in is a Better Auth signed session (`createTrustedBetterAuthSession`).
- `@@unique([providerId, accountId])` remains the DB backstop. `(userId, providerId)` is in the Prisma schema only (`map: "account_userId_providerId_key"`); no WC migration recreates it.

`app/api/peptideos-wc-sso` honours a same-origin `redirect` on success and returns a localized HTML error page (with a PeptideOS `/api/workouts/sso` try-again link, plus a support note on 409 collisions) for browser navigations. API callers still get JSON.
