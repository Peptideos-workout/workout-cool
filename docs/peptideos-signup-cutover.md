# PeptideOS as the only sign-up and sign-in

Workout-cool is reachable only through PeptideOS. New users register on PeptideOS (`https://peptideos.us/signup`). Existing users sign in on PeptideOS; after login, PeptideOS `/api/workouts/sso` (which sends signed-out users to `/login?next=/workouts`) launches workout-cool via `/api/peptideos-wc-sso`.

All current WC users have a `wc.account` row with `providerId = "peptideos"`. Direct email/password and Google sign-in are disabled.

## What is redirected vs blocked

| Surface | Behavior |
|---|---|
| Signed-out visitor on any non-allowlisted app page | **HTTP 307** from `proxy.ts` to PeptideOS `/api/workouts/sso` (SSO launcher). Optional `?redirect=` is a safe same-origin workout-cool URL (fail closed). |
| `/auth/signin` and `/auth/signup` pages, header login/register, profile “sign up to continue”, program prompts | **Removed**. Middleware sends signed-out visitors to PeptideOS SSO. |
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

After PeptideOS SSO the session still lands on `/` (`finalizeSession`). The `redirect` query on the PeptideOS SSO URL is best-effort only. Return URLs that contain `\`, `%5c` (any case), stay encoded after 8 decode rounds, or have malformed `%` are dropped; the parsed origin must equal `new URL(appUrl).origin`.

## Signed-out allowlist

`proxy.ts` matcher already skips `api`, `_next`, static assets, `robots.txt`, and `sitemap.xml`. The signed-out gate still allowlists these explicitly, plus:

- `/auth/signout` (any locale prefix)
- `/api/peptideos-wc-sso` and subpaths
- `/api/health`
- `/api/webhooks/*`
- `/api/auth/*` (sign-in/sign-up/reset still blocked in the Better Auth catch-all)
- `/legal/*` (privacy, terms, sales-terms)

**Public marketing pages are not public.** Home, about, tools, programs, and other app routes redirect signed-out visitors to PeptideOS. **Legal pages stay public** so policy/compliance URLs keep working without a session.

`/auth/link-peptideos` is not on the allowlist.

Locale prefixes are matched case-insensitively (`/zh-cn`, `/zh-CN`, `/ZH-CN`).

## Unique `(userId, providerId)`

`wc.account` already has `@@unique([providerId, accountId])` (one PeptideOS user cannot link to two WC users). It does **not** have `@@unique([userId, providerId])`, so one WC user could still get two `peptideos` rows.

Proposed, **not applied**: `docs/sql/account-user-provider-unique.sql` (pre-check for duplicates, then unique index). Rollback: `docs/sql/account-user-provider-unique.rollback.sql`.

## PeptideOS #32 provisioning / sync

This agent could not read `Peptideos-workout/PeptideOS` (repo 404 from this environment). On that side, the `auth.users` trigger, `wc.backfill_peptideos_accounts`, and the reconcile cron should insert `wc.account` with `ON CONFLICT ("userId", "providerId") DO NOTHING` (or equivalent) **and** keep the existing unique `(providerId, accountId)` so a PeptideOS hid cannot attach to a second WC user. Apply the WC unique index before relying on those paths to stay one-to-one.

## PeptideOS URL

Do not invent a required env (that would fail Vercel builds). This repo already uses `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` as the workout origin (`https://workouts.peptideos.us`). PeptideOS already has the reverse pointer `NEXT_PUBLIC_WORKOUT_COOL_URL`.

Optional `NEXT_PUBLIC_PEPTIDEOS_URL` is the reverse of that pairing. If unset and the app host is `workouts.<apex>`, origin is `https://<apex>`. Otherwise `https://peptideos.us`.

SSO launcher path is `/api/workouts/sso` (PeptideOS then sends signed-out users to `/login?next=/workouts`).

## Security invariants (PRs #1 and #2)

- No account takeover by email match: SSO still rejects unless a `peptideos` account already links that PeptideOS user id. Google account linking by email is disabled.
- New SSO users still get a random unused password; sign-in is a Better Auth signed session (`createTrustedBetterAuthSession`).
- `@@unique([providerId, accountId])` remains the DB backstop. The extra `(userId, providerId)` unique is proposed in `docs/sql/` only.

This PR does not edit `app/api/peptideos-wc-sso`.
