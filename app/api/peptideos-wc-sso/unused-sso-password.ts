import crypto from "crypto";

/** Random password stored on new SSO users and never used for sign-in. */
export function newUnusedSsoPassword(): string {
  return crypto.randomBytes(32).toString("hex");
}
