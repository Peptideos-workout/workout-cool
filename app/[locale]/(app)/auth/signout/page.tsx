import Link from "next/link";
import { headers } from "next/headers";
import { getI18n } from "locales/server";

import { signOutAction } from "@/features/auth/signout/model/signout.action";
import { signOutCancelHref } from "@/features/auth/signout/lib/signout-cancel-href";
import { env } from "@/env";
import { Button } from "@/components/ui/button";

export default async function AuthSignOutPage() {
  const t = await getI18n();
  const headerList = await headers();
  const cancelHref = signOutCancelHref(headerList.get("referer") ?? undefined, env.NEXT_PUBLIC_APP_URL);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("signout_confirm_title")}</h1>
        <form action={signOutAction} className="flex w-full flex-col items-center gap-3" data-wc-signout="">
          <Button className="w-full" type="submit">
            {t("logout")}
          </Button>
        </form>
        <Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href={cancelHref}>
          {t("commons.cancel")}
        </Link>
      </div>
    </div>
  );
}
