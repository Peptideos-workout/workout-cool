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

  const sanitized: SanitizedSsoError = {
    name: allowlistedName(rawName),
    code: allowlistedCode(rawCode)
  };
  const message = rawMessage.trim();
  if (ALLOWLISTED_MESSAGES.has(message)) {
    sanitized.message = message;
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
