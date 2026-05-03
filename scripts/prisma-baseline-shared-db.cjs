/**
 * Shared Supabase: Workout tables live in schema `wc` (see prisma/schema.prisma).
 * Applying migrations (`migrate deploy` via DIRECT_DATABASE_URL) is safe for PeptideOS `public.*` data.
 *
 * If migrate fails with **P3005** on shared DB, bootstrap once first: npm run db:bootstrap:w:direct
 */
const { spawnSync } = require("child_process");
const path = require("path");

console.log(
  "[db:baseline:direct] Running prisma migrate deploy with DIRECT_DATABASE_URL.\n",
  "(Schema `wc` only — ignores Peptide/public and Supabase auth.)\n",
);

const r = spawnSync(
  process.execPath,
  [path.join(__dirname, "prisma-migrate-direct.cjs")],
  { stdio: "inherit", cwd: path.join(__dirname, "..") },
);
process.exit(typeof r.status === "number" && r.status !== null ? r.status : 1);
