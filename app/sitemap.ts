import { MetadataRoute } from "next/types";

import { workoutCoolPublicOrigin } from "@/shared/lib/workout-cool-public-origin";
import { getSitemapData } from "@/features/programs/actions/get-sitemap-data.action";
import { getConfiguredPeptideOsSignupUrl } from "@/features/auth/lib/configured-peptideos-signup";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = workoutCoolPublicOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const currentDate = new Date().toISOString();

  // Static routes with locale support
  const locales = ["fr", "en", "es", "pt", "ru", "zh-CN"];

  const staticRoutes = [
    // Home page (root)
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    // Home pages for all locales
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}`,
      lastModified: currentDate,
      changeFrequency: "daily" as const,
      priority: 1.0,
    })),
    // Tools pages for all locales
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}/tools`,
      lastModified: currentDate,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    // Calorie calculator hub pages for all locales
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}/tools/calorie-calculator`,
      lastModified: currentDate,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    // Calorie calculator formula pages for all locales
    ...locales.flatMap((locale) =>
      [
        `${baseUrl}/${locale}/tools/calorie-calculator`,
        `${baseUrl}/${locale}/tools/calorie-calculator/mifflin-st-jeor-calculator`,
        `${baseUrl}/${locale}/tools/calorie-calculator/harris-benedict-calculator`,
        `${baseUrl}/${locale}/tools/calorie-calculator/katch-mcardle-calculator`,
        `${baseUrl}/${locale}/tools/calorie-calculator/cunningham-calculator`,
        `${baseUrl}/${locale}/tools/calorie-calculator/oxford-calculator`,
        `${baseUrl}/${locale}/tools/calorie-calculator/calorie-calculator-comparison`,
      ].map((url) => ({
        url,
        lastModified: currentDate,
        changeFrequency: "monthly" as const,
        priority: 0.85,
      })),
    ),

    // Heart rate calculator pages for all locales
    ...locales.flatMap((locale) =>
      [`${baseUrl}/${locale}/tools/heart-rate-zones`].map((url) => ({
        url,
        lastModified: currentDate,
        changeFrequency: "monthly" as const,
        priority: 0.85,
      })),
    ),

    // BMI calculator
    ...locales.flatMap((locale) =>
      [`${baseUrl}/${locale}/tools/bmi-calculator`].map((url) => ({
        url,
        lastModified: currentDate,
        changeFrequency: "monthly" as const,
        priority: 0.85,
      })),
    ),
    {
      url: getConfiguredPeptideOsSignupUrl(),
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    },
    // Premium marketing pages
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}/premium`,
      lastModified: currentDate,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    // Leaderboard
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}/leaderboard`,
      lastModified: currentDate,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    // About pages for all locales
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    ...locales.map((locale) => ({
      url: `${baseUrl}/${locale}/about`,
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Tools pages for all locales
    {
      url: `${baseUrl}/tools`,
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },

    // Legal pages
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: currentDate,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: currentDate,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    },
    {
      url: `${baseUrl}/legal/sales-terms`,
      lastModified: currentDate,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    },
    // Legal pages for all locales
    ...locales.flatMap((locale) => [
      {
        url: `${baseUrl}/${locale}/legal/privacy`,
        lastModified: currentDate,
        changeFrequency: "yearly" as const,
        priority: 0.2,
      },
      {
        url: `${baseUrl}/${locale}/legal/terms`,
        lastModified: currentDate,
        changeFrequency: "yearly" as const,
        priority: 0.2,
      },
      {
        url: `${baseUrl}/${locale}/legal/sales-terms`,
        lastModified: currentDate,
        changeFrequency: "yearly" as const,
        priority: 0.2,
      },
    ]),
  ];

  // Get dynamic program data for sitemap
  const programsData = await getSitemapData();

  // Generate dynamic routes
  const dynamicRoutes: MetadataRoute.Sitemap = [];

  dynamicRoutes.push({
    url: `${baseUrl}/programs`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  });

  // Add programs index pages for each locale
  locales.forEach((locale) => {
    dynamicRoutes.push({
      url: `${baseUrl}/${locale}/programs`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    });
  });

  // Add program detail pages and their sessions
  programsData.forEach((program) => {
    // Program detail pages for each locale
    const programSlugs = {
      fr: program.slug,
      en: program.slugEn,
      es: program.slugEs,
      pt: program.slugPt,
      ru: program.slugRu,
      "zh-CN": program.slugZhCn,
    };

    if (program.slug) {
      dynamicRoutes.push({
        url: `${baseUrl}/programs/${program.slug}`,
        lastModified: program.updatedAt.toISOString(),
        changeFrequency: "weekly" as const,
        priority: 0.9,
      });
    }

    Object.entries(programSlugs).forEach(([locale, slug]) => {
      if (slug) {
        // Program detail page (session routes are gated and omitted, including unprefixed)
        dynamicRoutes.push({
          url: `${baseUrl}/${locale}/programs/${slug}`,
          lastModified: program.updatedAt.toISOString(),
          changeFrequency: "weekly" as const,
          priority: 0.9,
        });
      }
    });
  });

  // Combine static and dynamic routes
  return [...staticRoutes, ...dynamicRoutes];
}
