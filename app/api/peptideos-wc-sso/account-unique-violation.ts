function collectErrorCodes(error: unknown, seen = new Set<object>()): Set<string> {
  const codes = new Set<string>();
  if (!error || typeof error !== "object" || seen.has(error)) {
    return codes;
  }
  seen.add(error);

  const rec = error as { code?: unknown; cause?: unknown };
  if (typeof rec.code === "string" && rec.code.trim()) {
    codes.add(rec.code.trim());
  }
  if (rec.cause) {
    for (const code of collectErrorCodes(rec.cause, seen)) {
      codes.add(code);
    }
  }
  return codes;
}

export function isAccountUniqueViolation(error: unknown): boolean {
  const codes = collectErrorCodes(error);
  return codes.has("P2002") || codes.has("23505");
}
