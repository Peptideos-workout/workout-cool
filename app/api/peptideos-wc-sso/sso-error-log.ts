export interface SanitizedSsoError {
  name: string;
  code: string;
  message: string;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SECRET_ASSIGN_RE = /\b(password|secret|token|authorization|bearer)\s*[:=]\s*\S+/gi;
const BEARER_RE = /\bbearer\s+\S+/gi;
const HEX_RE = /\b[a-f0-9]{32,}\b/gi;

export function redactSsoLogText(text: string): string {
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(JWT_RE, "[token]")
    .replace(SECRET_ASSIGN_RE, "$1=[redacted]")
    .replace(BEARER_RE, "bearer [redacted]")
    .replace(HEX_RE, "[hex]")
    .slice(0, 300);
}

export function sanitizeSsoErrorForLog(error: unknown): SanitizedSsoError {
  const name =
    error instanceof Error
      ? error.name
      : typeof error === "object" && error !== null && "name" in error && typeof (error as { name: unknown }).name === "string"
        ? (error as { name: string }).name
        : typeof error;
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);

  return { name, code, message: redactSsoLogText(rawMessage) };
}

/** Server-side only. Client responses stay `{ error: "sso_email_collision" }`. */
export function logSsoEmailCollision(reason: string, error?: unknown): void {
  console.error("[peptideos-wc-sso] sso_email_collision", {
    reason,
    ...(error === undefined ? {} : sanitizeSsoErrorForLog(error))
  });
}
