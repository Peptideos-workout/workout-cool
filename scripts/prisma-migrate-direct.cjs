/**
 * Runs `prisma migrate deploy` with DIRECT_DATABASE_URL (direct Postgres session),
 * avoiding transaction pool URIs (?pgbouncer=true / :6543) that hang Prisma Migrate.
 *
 * Usage from repo root: `npm run db:migrate:direct` or `node scripts/prisma-migrate-direct.cjs`.
 */
const { execSync } = require("child_process");
const { loadDirectDatabaseUrl } = require("./load-direct-database-url.cjs");

const { directTrim, root } = loadDirectDatabaseUrl();

// Pooler URIs often use postgres.<project-ref>@pooler.* — Supabase db.* direct expects user `postgres`.
const credMatch = /^postgres(?:ql)?:\/\/([^@]+)@/i.exec(directTrim);
const pgUserPart = credMatch?.[1] ?? "";
const pgUser = pgUserPart.split(":")[0] ?? "";
const isSupabaseDirect = /@db\.[a-z0-9]+\.supabase\.co:5432/i.test(directTrim);
if (isSupabaseDirect && pgUser.includes(".")) {
  console.error(
    "Hint (Supabase): For host db.<ref>.supabase.co use PostgreSQL user `postgres`, not `postgres.<ref>`.\n",
  );
}

try {
  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: directTrim },
  });
} catch (e) {
  process.exit(typeof e.status === "number" ? e.status : 1);
}
