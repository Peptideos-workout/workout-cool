# Change password: PeptideOS email identity (workout-cool)

Workout-cool never updates a PeptideOS password. It also does not use a Supabase service-role key or `auth.admin.updateUser`. PeptideOS remains the only password controller.

## Approach

**(b) a minimal read-only check.** A `SECURITY DEFINER` SQL function in schema `wc` returns only a boolean for a given `auth.users.id`, from `auth.identities` where `provider = 'email'`. Granted only to WC's database login role (`CURRENT_USER` when the SQL is applied). `search_path` is pinned to `auth, pg_temp`.

Rejected **(a)** (a signed `has_email_identity` claim on the PeptideOS→WC SSO handoff): it needs a PeptideOS deploy and a change to `/api/peptideos-wc-sso` (owned by PR #3). This option works without that deploy and leaks only a boolean, at query time, instead of a durable session claim.

## Visibility

| User | Change password |
|---|---|
| Linked PeptideOS + email/password identity | Shown. Links to PeptideOS `/settings#password`. Copy says this changes the PeptideOS password, also used for workouts. Optional same-origin `?redirect=` return (same rules as signup). |
| Linked PeptideOS, Google/OAuth only | Hidden |
| Linked PeptideOS, identity unknown (SQL missing, error, bad id) | Hidden (fail closed) |
| Legacy WC `credential` row, no `peptideos` account | Unchanged: local `PasswordForm` / `updateCredentialPassword` |
| PeptideOS-linked user who also has an unused SSO `credential` row | Treated as PeptideOS (not legacy) |

## Deploy order (do not apply from this PR)

This SQL is **not** a Prisma migration. `prisma migrate deploy` / `.github/workflows/migrate-wc.yml` stay table-only on `wc`. Apply by hand on the **direct** URI (`DIRECT_DATABASE_URL`, port 5432), never the pooler.

1. **Optional first:** deploy this workout-cool release. PeptideOS-linked users stay hidden until step 2 (fail closed). Legacy credential users keep the local form.
2. Apply `docs/sql/peptideos-has-email-identity.sql` as the WC DB role (the `DATABASE_URL` / `DIRECT_DATABASE_URL` login). Confirm `REVOKE … FROM PUBLIC` and `GRANT EXECUTE … TO` that role only.
3. If WC was already deployed, no extra app deploy is required — the next session fetch sees the boolean.
4. Rollback: `docs/sql/peptideos-has-email-identity.rollback.sql`. After drop, the UI fails closed again for PeptideOS-linked users.

Do not run this against real user data from a development agent. Do not grant `anon`, `authenticated`, or a service role.

## PeptideOS return link

`?redirect=` is the same safe same-origin query used for PeptideOS signup. If PeptideOS `/settings` ignores it, the user still lands on the password section (`#password`). Off-origin, backslash, and over-encoded values are dropped.
