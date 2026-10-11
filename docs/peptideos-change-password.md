# Change password: PeptideOS email identity (workout-cool)

Workout-cool never updates a PeptideOS password. It also does not use a Supabase service-role key or `auth.admin.updateUser`. PeptideOS remains the only password controller.

The local `PasswordForm` / `updateCredentialPassword` / `PUT /api/user/password` path is removed. Every WC user is PeptideOS-linked, and workout-cool email/Google sign-in is gone.

## Approach

**(b) a minimal read-only check.** A `SECURITY DEFINER` SQL function in schema `wc` returns only a boolean for a given `auth.users.id`, from `auth.identities` where `provider = 'email'`. `search_path` is empty (`''`); the query uses fully qualified `auth.identities`. `PUBLIC`, `anon`, `authenticated`, and `service_role` are revoked. `EXECUTE` is granted only to `postgres` (WC's DB login role).

## Visibility

| User | Change password |
|---|---|
| Linked PeptideOS + email/password identity | Shown. Links to PeptideOS `/settings#password`. Copy says this changes the PeptideOS password, also used for workouts. Client accepts `passwordChange.href` only when it is http(s) on the configured PeptideOS origin; otherwise it falls back to the configured settings URL. |
| Linked PeptideOS, Google/OAuth only | Hidden |
| Linked PeptideOS, identity unknown (SQL missing, error, bad id) | Hidden (fail closed) |
| Leftover WC `credential` row | Hidden (no local form) |

## Deploy order (do not apply from this PR)

This SQL is **not** a Prisma migration. `prisma migrate deploy` / `.github/workflows/migrate-wc.yml` stay table-only on `wc`. Apply by hand on the **direct** URI (`DIRECT_DATABASE_URL`, port 5432), never the pooler.

1. **Optional first:** deploy this workout-cool release. PeptideOS-linked users stay hidden until step 2 (fail closed).
2. Apply `docs/sql/peptideos-has-email-identity.sql`. Confirm `REVOKE … FROM PUBLIC, anon, authenticated, service_role` and `GRANT EXECUTE … TO postgres`.
3. If WC was already deployed, no extra app deploy is required — the next session fetch sees the boolean.
4. Rollback: `docs/sql/peptideos-has-email-identity.rollback.sql`. After drop, the UI fails closed again.

Do not run this against real user data from a development agent.

## PeptideOS return link

`?redirect=` is the same safe same-origin query used for PeptideOS signup. If PeptideOS `/settings` ignores it, the user still lands on the password section (`#password`). Off-origin, backslash, and over-encoded values are dropped. The Change password `<Link href>` is re-checked on the client against the configured PeptideOS origin.
