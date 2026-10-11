export const CREDENTIAL_PROVIDER = "credential";
export const PEPTIDEOS_PROVIDER = "peptideos";

export interface SsoAccountSnapshot {
  existingUser: { id: string } | null;
  existingCredential: { id: string; password: string | null } | null;
  peptideosAccountId: string | null;
}

export function isVerifiablySameIdentity(
  peptideosUserId: string,
  derivedPasswordHash: string,
  snapshot: SsoAccountSnapshot,
): boolean {
  if (!snapshot.existingUser) return false;
  if (snapshot.existingUser.id === peptideosUserId) return true;
  if (snapshot.peptideosAccountId === peptideosUserId) return true;
  return snapshot.existingCredential?.password != null && snapshot.existingCredential.password === derivedPasswordHash;
}

export type SsoAccountAction =
  | { type: "create_user" }
  | {
      type: "sign_in";
      userId: string;
      createCredential: boolean;
      createPeptideosAccount: boolean;
      allowTrustedSession: boolean;
    }
  | { type: "reject"; error: "sso_email_collision" };

export function resolveSsoAccountAction(
  peptideosUserId: string,
  derivedPasswordHash: string,
  snapshot: SsoAccountSnapshot,
): SsoAccountAction {
  if (!snapshot.existingUser) {
    return { type: "create_user" };
  }

  if (!isVerifiablySameIdentity(peptideosUserId, derivedPasswordHash, snapshot)) {
    return { type: "reject", error: "sso_email_collision" };
  }

  const passwordMatches =
    snapshot.existingCredential?.password != null && snapshot.existingCredential.password === derivedPasswordHash;

  return {
    type: "sign_in",
    userId: snapshot.existingUser.id,
    createCredential: snapshot.existingCredential == null,
    createPeptideosAccount: snapshot.peptideosAccountId !== peptideosUserId,
    allowTrustedSession: snapshot.existingCredential != null && !passwordMatches
  };
}
