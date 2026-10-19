import { Metadata } from "next";
import { Locale } from "locales/types";
import { getI18n } from "locales/server";

import { getProgramsPageMetadata } from "@/shared/config/home-metadata";
import { ProgramsPage } from "@/features/programs/ui/programs-page";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return getProgramsPageMetadata(locale);
}

export default async function ProgramsRootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: Locale };
  const t = await getI18n();

  const breadcrumbItems = [
    {
      label: t("breadcrumbs.home"),
      href: `/${locale}`,
    },
    {
      label: t("programs.workout_programs"),
      current: true,
    },
  ];

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <ProgramsPage locale={locale} />
    </>
  );
}
