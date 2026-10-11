export const CREDENTIAL_PROVIDER = "credential";
export const PEPTIDEOS_PROVIDER = "peptideos";

export interface SsoAccountSnapshot {
  existingUser: { id: string } | null;
  peptideosAccountId: string | null;
}

export function isVerifiablySameIdentity(peptideosUserId: string, snapshot: SsoAccountSnapshot): boolean {
  return snapshot.existingUser != null && snapshot.peptideosAccountId === peptideosUserId;
}

export type SsoAccountAction =
  | { type: "create_user" }
  | { type: "sign_in"; userId: string }
  | { type: "reject"; error: "sso_email_collision" };

export function resolveSsoAccountAction(peptideosUserId: string, snapshot: SsoAccountSnapshot): SsoAccountAction {
  if (!snapshot.existingUser) {
    return { type: "create_user" };
  }

  if (!isVerifiablySameIdentity(peptideosUserId, snapshot)) {
    return { type: "reject", error: "sso_email_collision" };
  }

  return { type: "sign_in", userId: snapshot.existingUser.id };
}
