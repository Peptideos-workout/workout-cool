# PeptideOS as the single sign-up

Workout-cool no longer creates accounts through its own email/password or Google sign-up. New users register on PeptideOS (`https://peptideos.us/signup`). Existing PeptideOS users still sign into workout-cool through `/api/peptideos-wc-sso`.

## Legacy direct sign-in: kept

**Email/password and Google sign-in stay available for accounts that already exist.**

Reasons:

- PeptideOS becoming the only *sign-up* must not lock out users who already have a `wc.user` row and a credential or Google account.
- The separate PeptideOS provisioning PR is not in this repo and is not assumed to have backfilled every legacy identity.
- SSO sign-in already requires a `wc.account` row with `providerId = "peptideos"` and `accountId =` the PeptideOS auth user id. Email match is not identity (PR #1). Users who only have local credentials would be stranded if direct sign-in were removed now.
- Google **sign-in** is only for an existing Google `wc.account`. Google **sign-up** (new user, or linking by email) is blocked.

Revisit after PeptideOS has provisioned `wc.user` / `wc.account` for every legacy identity and those users have a PeptideOS login.

## What is redirected vs blocked

| Surface | Behavior |
|---|---|
| `/auth/signup` page, header/register, sign-in “Sign up”, profile alert, program “signup to continue” | **Redirect / link** to PeptideOS `/signup` (optional `?redirect=` same-origin workout-cool URL; PeptideOS may ignore it) |
| `signUpAction` server action | **Blocked** (`public_signup_disabled`) |
| `POST /api/auth/signup` | **Blocked** `403` + `{ error, redirectTo }` |
| Better Auth HTTP `POST /api/auth/sign-up/email` and `/api/auth/admin/create-user` (catch-all `[...all]`) | **Blocked** `403` + `{ error, redirectTo }` |
| Google OAuth `disableSignUp` / `disableImplicitSignUp` | **Blocked** new-user creation |
| Google / email **sign-in** for existing accounts | **Allowed** |
| `/api/peptideos-wc-sso` create-user (`auth.api.signUpEmail` in-process + `peptideos` account + signed session) | **Allowed** — this PR does **not** edit that route |

After PeptideOS SSO the session still lands on `/` (`finalizeSession` is owned by PR #3). The `redirect` query is best-effort only.

PR #3 (account-link) owns `app/api/peptideos-wc-sso` and `/auth/link-peptideos`. This cutover does not touch those files. `/auth/link-peptideos` is not redirected to PeptideOS.

## PeptideOS URL

Do not invent a required env (that would fail Vercel builds). This repo already uses `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` as the workout origin (`https://workouts.peptideos.us`). PeptideOS already has the reverse pointer `NEXT_PUBLIC_WORKOUT_COOL_URL`.

Optional `NEXT_PUBLIC_PEPTIDEOS_URL` is the reverse of that pairing. If unset and the app host is `workouts.<apex>`, origin is `https://<apex>`. Otherwise `https://peptideos.us`. Signup path is `/signup` (PeptideOS `app/(auth)/signup`).

## Security invariants (PRs #1 and #2)

- No account takeover by email match: SSO still rejects unless a `peptideos` account already links that PeptideOS user id. Google account linking by email is disabled.
- New SSO users still get a random unused password; sign-in is a Better Auth signed session (`createTrustedBetterAuthSession`).
- `@@unique([providerId, accountId])` remains the DB backstop. This PR does not change the schema.

## Notes for the PeptideOS provisioning PR

That PR should insert `wc.user` / `wc.account` itself (`providerId = "peptideos"`, `accountId =` PeptideOS `auth.users.id`). Reuse:

- `PEPTIDEOS_PROVIDER` (`"peptideos"`) and the unique `(providerId, accountId)` pair
- Never attach a `peptideos` account to an existing `wc.user` because emails match (`sso_email_collision`)
- After those rows exist, SSO takes the **sign_in** path and does not call `signUpEmail`
- Until then, keep using this repo’s SSO create-user path (in-process `auth.api.signUpEmail`, not `/api/auth/signup` or `signUpAction`)
- If inserting via Prisma/SQL, you do not need Better Auth `signUpEmail` or a login password

Do not apply migrations or restore the shared Supabase project from this workout-cool change.
