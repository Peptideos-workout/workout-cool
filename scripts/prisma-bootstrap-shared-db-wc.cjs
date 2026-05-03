/**
 * First-time deploy on shared Supabase: `migrate deploy` fails with P3005 because Postgres is not empty
 * (Peptide/public + auth tables exist), even though Prisma only manages schema `wc`.
 *
 * Runs `prisma db execute` for `prisma/migrations/0_init/migration.sql`, then
 * `prisma migrate resolve --applied 0_init`. Only touches objects in SQL (schema `wc`).
 *
 * One-time per database. Afterwards use `npm run db:migrate:direct`.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { loadDirectDatabaseUrl } = require("./load-direct-database-url.cjs");

const { directTrim, root } = loadDirectDatabaseUrl();

const migrationSql = path.join(root, "prisma", "migrations", "0_init", "migration.sql");
if (!fs.existsSync(migrationSql)) {
  console.error("Missing", migrationSql);
  process.exit(1);
}

/** Use DATABASE_URL in env — avoids brittle --url quoting for passwords. */
function run(cmdLine) {
  execSync(cmdLine, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: directTrim },
  });
}

console.log("\n→ prisma db execute (0_init migration.sql, schema wc only) …\n");
try {
  // UTF-8 BOM breaks Postgres ("syntax error near ﻿"); strip before send. Stdin avoids PowerShell BOM on --file reads.
  const sqlStripped = fs
    .readFileSync(migrationSql, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n");
  execSync(`npx prisma db execute --stdin --schema prisma/schema.prisma`, {
    cwd: root,
    input: sqlStripped,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, DATABASE_URL: directTrim },
  });
} catch {
  console.error("\nIf types/tables already exist, wc may be partially migrated — inspect errors above.\n");
  process.exit(1);
}

console.log("\n→ prisma migrate resolve --applied 0_init …\n");
try {
  run(`npx prisma migrate resolve --applied 0_init`);
} catch {
  console.error('\nIf 0_init is already recorded as applied, run: npm run db:migrate:direct\n');
  process.exit(1);
}

console.log('\nBootstrap done. Next: npm run db:migrate:direct (should report migrations in sync).\n');
