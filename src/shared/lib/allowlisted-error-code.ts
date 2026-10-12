/**
 * Exact codes that are too long for the short-word rule.
 * Node errno, HTTP-style names, and Better Auth codes from this app's auth dependency
 * (`BASE_ERROR_CODES` and the admin plugin enabled in `better-auth.ts`).
 */
export const KNOWN_ERROR_CODES = Object.freeze([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "UNPROCESSABLE_ENTITY",
  "TOO_MANY_REQUESTS",
  "INTERNAL_SERVER_ERROR",
  "USER_NOT_FOUND",
  "FAILED_TO_CREATE_USER",
  "FAILED_TO_CREATE_SESSION",
  "FAILED_TO_UPDATE_USER",
  "FAILED_TO_GET_SESSION",
  "INVALID_PASSWORD",
  "INVALID_EMAIL",
  "INVALID_EMAIL_OR_PASSWORD",
  "SOCIAL_ACCOUNT_ALREADY_LINKED",
  "PROVIDER_NOT_FOUND",
  "INVALID_TOKEN",
  "ID_TOKEN_NOT_SUPPORTED",
  "FAILED_TO_GET_USER_INFO",
  "USER_EMAIL_NOT_FOUND",
  "EMAIL_NOT_VERIFIED",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "USER_ALREADY_EXISTS",
  "EMAIL_CAN_NOT_BE_UPDATED",
  "CREDENTIAL_ACCOUNT_NOT_FOUND",
  "SESSION_EXPIRED",
  "FAILED_TO_UNLINK_LAST_ACCOUNT",
  "ACCOUNT_NOT_FOUND",
  "USER_ALREADY_HAS_PASSWORD",
  "YOU_CANNOT_BAN_YOURSELF",
  "YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE",
  "YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS",
  "YOU_ARE_NOT_ALLOWED_TO_LIST_USERS",
  "YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS",
  "YOU_ARE_NOT_ALLOWED_TO_BAN_USERS",
  "YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS",
  "YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS",
  "YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS",
  "YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD",
  "BANNED_USER"
] as const);

const knownErrorCodeSet = new Set<string>(KNOWN_ERROR_CODES);

/** Prisma `P####`, a 5-character SQL state, or a short `BAD_REQUEST`-style word code. */
const SHORT_ERROR_CODE = /^(?:P\d{4}|[0-9A-Z]{5}|[A-Z]{2,10}(?:_[A-Z]{2,10}){0,4})$/;

/** Known codes are accepted as-is. Everything else must match the short shape and be at most 24 characters. */
export function isAllowlistedErrorCode(value: string): boolean {
  const trimmed = value.trim();
  if (knownErrorCodeSet.has(trimmed)) return true;
  if (trimmed.length > 24) return false;
  return SHORT_ERROR_CODE.test(trimmed);
}
