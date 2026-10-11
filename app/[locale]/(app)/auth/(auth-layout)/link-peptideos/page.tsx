import { cookies } from "next/headers";

import { loadLinkPeptideosPageState } from "../../../../../api/peptideos-wc-sso/load-link-page";
import { LINK_COOKIE_NAME } from "../../../../../api/peptideos-wc-sso/link-cookie";

import { prisma } from "@/shared/lib/prisma";
import { LinkPeptideosForm } from "@/features/auth/link-peptideos/ui/link-peptideos-form";
import { env } from "@/env";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function LinkPeptideosPage() {
  const jar = await cookies();
  const state = await loadLinkPeptideosPageState({
    cookieValue: jar.get(LINK_COOKIE_NAME)?.value,
    secret: env.BETTER_AUTH_SECRET,
    now: Date.now(),
    findUserById: async (id) => prisma.user.findUnique({ where: { id }, select: { email: true } })
  });

  return <LinkPeptideosForm expired={state.expired} maskedEmail={state.maskedEmail} />;
}
