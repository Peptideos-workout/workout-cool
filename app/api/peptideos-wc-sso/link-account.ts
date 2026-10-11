import { PEPTIDEOS_PROVIDER } from "./resolve-sso-account";
import { verifyLinkCookie } from "./link-cookie";

export const PEPTIDEOS_LINK_GENERIC_ERROR = "Unable to link accounts.";

export interface LinkPeptideosDeps {
  now: () => number;
  secret: string;
  isJtiConsumed: (jti: string) => boolean;
  consumeJti: (jti: string) => boolean;
  isRateLimited: (wcUserId: string, ip: string) => boolean;
  recordFailure: (wcUserId: string, ip: string) => void;
  findUserById: (id: string) => Promise<{ id: string; email: string } | null>;
  verifyPassword: (email: string, password: string) => Promise<{ userId: string } | null>;
  linkAccount: (input: { wcUserId: string; peptideosUserId: string }) => Promise<"created" | "already_linked" | "conflict">;
  createSignedSession: (userId: string) => Promise<boolean>;
  auditLog: (entry: { wcUserId: string; peptideosUserId: string }) => void;
  sendLinkedEmail: (email: string) => Promise<void>;
}

export type LinkPeptideosResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number };

export function createLinkJtiStore() {
  const consumed = new Set<string>();
  return {
    isConsumed(jti: string): boolean {
      return consumed.has(jti);
    },
    consume(jti: string): boolean {
      if (consumed.has(jti)) return false;
      consumed.add(jti);
      return true;
    }
  };
}

export const defaultLinkJtiStore = createLinkJtiStore();

function fail(): LinkPeptideosResult {
  return { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 400 };
}

export function isAccountProviderConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

export async function insertPeptideosAccountLink(
  db: {
    create: (row: {
      id: string;
      accountId: string;
      providerId: string;
      userId: string;
      createdAt: Date;
      updatedAt: Date;
    }) => Promise<void>;
    findExisting: () => Promise<{ userId: string } | null>;
  },
  input: { wcUserId: string; peptideosUserId: string; newId: string; now: () => Date },
): Promise<"created" | "already_linked" | "conflict"> {
  const at = input.now();
  try {
    await db.create({
      id: input.newId,
      accountId: input.peptideosUserId,
      providerId: PEPTIDEOS_PROVIDER,
      userId: input.wcUserId,
      createdAt: at,
      updatedAt: at
    });
    return "created";
  } catch (error) {
    if (!isAccountProviderConflict(error)) throw error;
    const existing = await db.findExisting();
    if (existing?.userId === input.wcUserId) return "already_linked";
    return "conflict";
  }
}

export async function linkPeptideosAccount(
  input: { cookieValue: string; password: string; ip: string },
  deps: LinkPeptideosDeps,
): Promise<LinkPeptideosResult> {
  const payload = await verifyLinkCookie(input.cookieValue, deps.secret, deps.now());
  if (!payload) return fail();
  if (deps.isJtiConsumed(payload.jti)) return fail();

  const user = await deps.findUserById(payload.wcUserId);
  if (!user) return fail();
  if (deps.isRateLimited(payload.wcUserId, input.ip)) return fail();

  let authenticated: { userId: string } | null = null;
  try {
    authenticated = await deps.verifyPassword(user.email, input.password);
  } catch {
    authenticated = null;
  }

  if (!authenticated) {
    deps.recordFailure(payload.wcUserId, input.ip);
    return fail();
  }

  if (authenticated.userId !== payload.wcUserId) {
    deps.recordFailure(payload.wcUserId, input.ip);
    return fail();
  }

  const linked = await deps.linkAccount({
    wcUserId: payload.wcUserId,
    peptideosUserId: payload.peptideosUserId
  });
  if (linked === "conflict") {
    deps.recordFailure(payload.wcUserId, input.ip);
    return fail();
  }

  const signedIn = await deps.createSignedSession(payload.wcUserId);
  if (!signedIn) return { ok: false, error: PEPTIDEOS_LINK_GENERIC_ERROR, status: 500 };

  deps.consumeJti(payload.jti);
  deps.auditLog({ wcUserId: payload.wcUserId, peptideosUserId: payload.peptideosUserId });
  try {
    await deps.sendLinkedEmail(user.email);
  } catch {
    /* link already succeeded */
  }

  return { ok: true, userId: payload.wcUserId };
}
