import { getI18n } from "locales/server";

import { signOutAction } from "@/features/auth/signout/model/signout.action";
import { Button } from "@/components/ui/button";

export default async function AuthSignOutPage() {
  const t = await getI18n();

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <form action={signOutAction} className="flex flex-col items-center gap-4">
        <Button type="submit">{t("logout")}</Button>
      </form>
    </div>
  );
}
