import { NextResponse } from "next/server";

import { ssoJson } from "./sso-response";
import { LINK_PAGE_PATH, createLinkCookiePayload, serializeLinkCookie } from "./link-cookie";
import { handoffDisposition } from "./handoff-disposition";

import type { HandoffDisposition } from "./consume-handoff";
import type { CompleteSsoLoginResult } from "./complete-sso";

export async function createPeptideosLinkOffer(input: {
  peptideosUserId: string;
  wcUserId: string;
  origin: string;
  secret: string;
  now?: number;
  jti?: string;
}): Promise<NextResponse> {
  const payload = createLinkCookiePayload({
    peptideosUserId: input.peptideosUserId,
    wcUserId: input.wcUserId,
    now: input.now ?? Date.now(),
    jti: input.jti
  });
  const cookie = await serializeLinkCookie(payload, input.secret);
  const redirect = NextResponse.redirect(`${input.origin}${LINK_PAGE_PATH}`);
  redirect.headers.set("Cache-Control", "private, no-store");
  redirect.headers.append("set-cookie", cookie);
  return redirect;
}

export async function ssoCollisionHandoff(input: {
  completed: Extract<CompleteSsoLoginResult, { ok: false }>;
  peptideosUserId: string;
  origin: string;
  secret: string;
  now?: number;
  jti?: string;
}): Promise<{ value: NextResponse; disposition: HandoffDisposition }> {
  if (input.completed.error === "sso_email_collision" && input.completed.collidingUserId) {
    return {
      value: await createPeptideosLinkOffer({
        peptideosUserId: input.peptideosUserId,
        wcUserId: input.completed.collidingUserId,
        origin: input.origin,
        secret: input.secret,
        now: input.now,
        jti: input.jti
      }),
      disposition: "keep"
    };
  }

  return {
    value: ssoJson({ error: input.completed.error }, input.completed.status),
    disposition: handoffDisposition(input.completed.status, input.completed.wroteUserState)
  };
}
