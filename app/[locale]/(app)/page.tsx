import type { Metadata } from "next";

import { getServerUrl } from "@/shared/lib/server-url";
import { SiteConfig } from "@/shared/config/site-config";
import { getHomeMetadata, getHomeOgImageName } from "@/shared/config/home-metadata";
import { WorkoutStepper } from "@/features/workout-builder";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const { title, description, keywords } = getHomeMetadata(locale);
  const ogImageName = getHomeOgImageName(locale);

  return {
    title,
    description,
    keywords,
    openGraph: {
      title: `${title} | ${SiteConfig.title}`,
      description,
      images: [
        {
          url: `${getServerUrl()}/images/${ogImageName}`,
          width: SiteConfig.seo.ogImage.width,
          height: SiteConfig.seo.ogImage.height,
          alt: title,
        },
      ],
    },
    twitter: {
      title: `${title} | ${SiteConfig.title}`,
      description,
      images: [`${getServerUrl()}/images/${ogImageName}`],
    },
  };
}

export default async function HomePage() {
  return (
    <div className="bg-background text-foreground relative flex flex-col h-full">
      <WorkoutStepper />
    </div>
  );
}
