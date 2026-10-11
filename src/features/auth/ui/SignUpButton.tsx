import Link from "next/link";
import { getI18n } from "locales/server";

import { getConfiguredPeptideOsSignupUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { Button } from "@/components/ui/button";

export const SignUpButton = async () => {
  const t = await getI18n();

  return (
    <Button asChild variant="outline-black">
      <Link href={getConfiguredPeptideOsSignupUrl()}>{t("commons.register")}</Link>
    </Button>
  );
};
