export interface SanitizedSsoError {
  name: string;
  code: string;
  message?: string;
}

/** Exact safe diagnostics only — never raw Error.message (passwords, hashes, tokens, emails). */
const ALLOWLISTED_MESSAGES = new Set([
  "Unique constraint failed on the fields: (`email`)",
  "User already exists",
  "relation auth.users does not exist"
]);

function allowlistedName(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z][A-Za-z0-9.]{0,79}$/.test(trimmed) ? trimmed : "";
}

function allowlistedCode(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z0-9_]{1,32}$/.test(trimmed) ? trimmed : "";
}

function allowlistedReason(value: string): string {
  return /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : "";
}

function allowlistedScope(value: string): string {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : "sso";
}

/**
 * Emails, JWTs, query text, and token-like strings are never diagnostics.
 * Short stable codes (P2002, 42P01, BAD_REQUEST) and class names stay.
 */
function looksLikeSecret(value: string): boolean {
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return true;
  if (/eyJ[A-Za-z0-9_-]{8,}/.test(value)) return true;
  if (
    /(?:bearer|password\s*=|token\s*=|secret_token|\$queryRaw|\b(?:SELECT|UPDATE|INSERT|DELETE)\b|set-cookie|authorization)/i.test(
      value
    )
  ) {
    return true;
  }
  if (/^[a-f0-9]{16,}$/i.test(value)) return true;
  if (value.length >= 20 && /[-]/.test(value) && /[a-z]/i.test(value) && !/^[a-z][a-z0-9_]{0,63}$/.test(value)) return true;
  return false;
}

function safeDiagnostic(value: string): string {
  return value && !looksLikeSecret(value) ? value : "";
}

export function sanitizeSsoErrorForLog(error: unknown): SanitizedSsoError {
  const rawName =
    error instanceof Error
      ? error.name
      : typeof error === "object" && error !== null && "name" in error && typeof (error as { name: unknown }).name === "string"
        ? (error as { name: string }).name
        : typeof error;
  const rawCode =
    typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";

  // name + Prisma/SQL code + an exact allowlisted message. Never error.meta, query, args, or clientVersion.
  const sanitized: SanitizedSsoError = {
    name: safeDiagnostic(allowlistedName(rawName)),
    code: safeDiagnostic(allowlistedCode(rawCode))
  };
  const message = rawMessage.trim();
  if (ALLOWLISTED_MESSAGES.has(message)) {
    const safeMessage = safeDiagnostic(message);
    if (safeMessage) sanitized.message = safeMessage;
  }
  return sanitized;
}

export const SSO_LOG_LEVEL = {
  error: "error",
  info: "info",
  debug: "debug"
} as const;

/** Server-side only. Never logs stacks, raw Error objects, or non-allowlisted messages. */
export function logSsoEvent(
  scope: string,
  error?: unknown,
  reason?: string,
  level: keyof typeof SSO_LOG_LEVEL = SSO_LOG_LEVEL.error
): void {
  try {
    const payload: Record<string, string> = { scope: allowlistedScope(scope) };
    const safeReason = reason ? allowlistedReason(reason) : "";
    if (safeReason) payload.reason = safeReason;
    if (error !== undefined) {
      const sanitized = sanitizeSsoErrorForLog(error);
      if (sanitized.name) payload.name = sanitized.name;
      if (sanitized.code) payload.code = sanitized.code;
      if (sanitized.message) payload.message = sanitized.message;
    }
    const write = level === SSO_LOG_LEVEL.debug ? console.debug : level === SSO_LOG_LEVEL.info ? console.info : console.error;
    write("[peptideos-wc-sso]", payload);
  } catch {
    /* Logging must never change SSO disposition. */
  }
}

/** Server-side only. Client responses stay `{ error: "sso_email_collision" }`. */
export function logSsoEmailCollision(reason: string, error?: unknown): void {
  logSsoEvent("sso_email_collision", error, reason);
}
