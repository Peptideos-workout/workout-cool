/**
 * Reads DATABASE_URL from stdin, strips BOM/CRLF/outer quotes/trim, prints clean URL.
 * Used by setup.sh before Prisma (Windows .env / editor quirks).
 */
const fs = require("fs");

function main() {
  let s = fs.readFileSync(0, "utf8");
  s = s.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  process.stdout.write(s);
}

main();
