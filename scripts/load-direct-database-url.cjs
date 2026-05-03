const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");

function parseEnvFile(contents) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of contents.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    let key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** @returns {{ directTrim: string, root: string }} */
function loadDirectDatabaseUrl() {
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env at", envPath);
    process.exit(1);
  }
  const parsed = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  const direct =
    parsed.DIRECT_DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";
  const directTrim = typeof direct === "string" ? direct.trim() : "";

  if (!/^postgres(ql)?:\/\//i.test(directTrim)) {
    console.error(
      "Set DIRECT_DATABASE_URL in .env (Supabase direct: db.<ref>.supabase.co:5432, user `postgres`)."
    );
    process.exit(1);
  }

  return { directTrim, root };
}

module.exports = { loadDirectDatabaseUrl };
