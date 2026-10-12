import { isAllowlistedErrorCode } from "@/shared/lib/allowlisted-error-code";

/** Client-safe redactor. Never logs messages, stacks, emails, tokens, or session data. */
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

const ALLOWLISTED_SCOPE = /^[a-z][a-z0-9_]{0,63}$/;

export function logRedactedClientError(scope: string, error: unknown): void {
  try {
    const rawName =
      error instanceof Error
        ? error.name
        : typeof error === "object" && error !== null && "name" in error && typeof (error as { name: unknown }).name === "string"
          ? (error as { name: string }).name
          : "";
    const rawCode =
      typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : "";
    const payload: Record<string, string> = {
      scope: ALLOWLISTED_SCOPE.test(scope) ? scope : "auth"
    };
    const name = rawName.trim();
    if (KNOWN_ERROR_NAMES.has(name)) payload.name = name;
    const code = rawCode.trim();
    if (isAllowlistedErrorCode(code)) payload.code = code;
    console.error("[auth]", payload);
  } catch {
    /* Logging must never change the resend flow. */
  }
}
