import { maskEmail } from "./mask-email";
import { verifyLinkCookie } from "./link-cookie";

export interface LinkPeptideosPageState {
  expired: boolean;
  maskedEmail?: string;
}

export async function loadLinkPeptideosPageState(deps: {
  cookieValue: string | undefined;
  secret: string;
  now: number;
  findUserById: (id: string) => Promise<{ email: string } | null>;
}): Promise<LinkPeptideosPageState> {
  if (!deps.cookieValue) return { expired: true };
  const payload = await verifyLinkCookie(deps.cookieValue, deps.secret, deps.now);
  if (!payload) return { expired: true };
  const user = await deps.findUserById(payload.wcUserId);
  if (!user?.email) return { expired: true };
  return { expired: false, maskedEmail: maskEmail(user.email) };
}
