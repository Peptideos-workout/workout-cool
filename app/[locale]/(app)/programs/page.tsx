import { Metadata } from "next";
import { Locale } from "locales/types";
import { getI18n } from "locales/server";

import { getServerUrl } from "@/shared/lib/server-url";
import { SiteConfig } from "@/shared/config/site-config";
import { getOgImageName, getOgLocale, getProgramsMetadata, getProgramsOpenGraphTitle } from "@/shared/config/home-metadata";
import { ProgramsPage } from "@/features/programs/ui/programs-page";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const { title, description } = getProgramsMetadata(locale);
  const socialTitle = getProgramsOpenGraphTitle(locale);
  const ogImageName = getOgImageName(locale);
  const imageUrl = `${getServerUrl()}/images/${ogImageName}`;

  return {
    title,
    description,
    openGraph: {
      title: socialTitle,
      description,
      locale: getOgLocale(locale),
      images: [
        {
          url: imageUrl,
          width: SiteConfig.seo.ogImage.width,
          height: SiteConfig.seo.ogImage.height,
          alt: title,
        },
      ],
    },
    twitter: {
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  };
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
