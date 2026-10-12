export interface SanitizedSsoError {
  name: string;
  code: string;
  message?: string;
  status?: number;
}

/** Exact safe diagnostics only — never raw Error.message (passwords, hashes, tokens, emails). */
const ALLOWLISTED_MESSAGES = new Set([
  "Unique constraint failed on the fields: (`email`)",
  "User already exists",
  "relation auth.users does not exist"
]);

/** Class names only. Every entry ends in Error; arbitrary *Error strings are rejected. */
const KNOWN_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "APIError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError",
  "PrismaClientRustPanicError",
  "PrismaClientValidationError"
]);

function allowlistedName(value: string): string {
  const trimmed = value.trim();
  return KNOWN_ERROR_NAMES.has(trimmed) ? trimmed : "";
}

/**
 * Prisma `P####`, a 5-character SQL state, or a short word code such as `BAD_REQUEST`.
 * Each word is at most 10 letters, at most four underscores, and the whole code is at most 24 characters.
 * A long unbroken uppercase token does not match.
 */
function allowlistedCode(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 24) return "";
  return /^(P\d{4}|[0-9A-Z]{5}|[A-Z]{2,10}(?:_[A-Z]{2,10}){0,4})$/.test(trimmed) ? trimmed : "";
}

/** HTTP status only. Strings, floats, and values outside 100–599 are dropped. */
function allowlistedHttpStatus(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 100 || value > 599) return undefined;
  return value;
}

function allowlistedReason(value: string): string {
  return /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : "";
}

function allowlistedScope(value: string): string {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : "sso";
}

/**
 * Emails, JWTs, query text, and token-like strings are never diagnostics.
 * Short stable codes (P2002, 42P01, BAD_REQUEST) and known class names stay.
 */
function looksLikeSecret(value: string): boolean {
  if (value.length > 256) return true;
  if (/[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,24}/i.test(value)) return true;
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
  const rawStatus = typeof error === "object" && error !== null && "status" in error ? (error as { status: unknown }).status : undefined;
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
  const status = allowlistedHttpStatus(rawStatus);
  if (status !== undefined) sanitized.status = status;
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
    const payload: Record<string, string | number> = { scope: allowlistedScope(scope) };
    const safeReason = reason ? allowlistedReason(reason) : "";
    if (safeReason) payload.reason = safeReason;
    if (error !== undefined) {
      const sanitized = sanitizeSsoErrorForLog(error);
      if (sanitized.name) payload.name = sanitized.name;
      if (sanitized.code) payload.code = sanitized.code;
      if (sanitized.message) payload.message = sanitized.message;
      if (sanitized.status !== undefined) payload.status = sanitized.status;
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
