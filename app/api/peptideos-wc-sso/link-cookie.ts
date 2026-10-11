import { serializeBetterAuthSignedCookie, verifyBetterAuthCookieValue } from "./signed-cookie";

export const LINK_COOKIE_NAME = "peptideos_link";
export const LINK_COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const LINK_PAGE_PATH = "/auth/link-peptideos";

export interface PeptideosLinkCookiePayload {
  v: 1;
  peptideosUserId: string;
  wcUserId: string;
  jti: string;
  exp: number;
}

export function createLinkCookiePayload(input: {
  peptideosUserId: string;
  wcUserId: string;
  now: number;
  jti?: string;
}): PeptideosLinkCookiePayload {
  return {
    v: 1,
    peptideosUserId: input.peptideosUserId,
    wcUserId: input.wcUserId,
    jti: input.jti ?? crypto.randomUUID(),
    exp: input.now + LINK_COOKIE_MAX_AGE_SECONDS * 1000
  };
}

export function parseLinkCookiePayload(raw: string): PeptideosLinkCookiePayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PeptideosLinkCookiePayload>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.peptideosUserId !== "string" || parsed.peptideosUserId.length === 0) return null;
    if (typeof parsed.wcUserId !== "string" || parsed.wcUserId.length === 0) return null;
    if (typeof parsed.jti !== "string" || parsed.jti.length === 0) return null;
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return null;
    return {
      v: 1,
      peptideosUserId: parsed.peptideosUserId,
      wcUserId: parsed.wcUserId,
      jti: parsed.jti,
      exp: parsed.exp
    };
  } catch {
    return null;
  }
}

export async function serializeLinkCookie(payload: PeptideosLinkCookiePayload, secret: string): Promise<string> {
  return serializeBetterAuthSignedCookie(LINK_COOKIE_NAME, JSON.stringify(payload), secret, {
    path: "/",
    maxAge: LINK_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

export function expireLinkCookie(): string {
  return `${LINK_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export async function verifyLinkCookie(
  encoded: string,
  secret: string,
  now: number,
): Promise<PeptideosLinkCookiePayload | null> {
  const raw = await verifyBetterAuthCookieValue(encoded, secret);
  if (!raw) return null;
  const payload = parseLinkCookiePayload(raw);
  if (!payload || payload.exp <= now) return null;
  return payload;
}
