import type { MetadataRoute } from "next";

import { workoutCoolPublicOrigin } from "@/shared/lib/workout-cool-public-origin";

const GATED_DISALLOWS = [
  "/admin/",
  "/*/admin/",
  "/api/",
  "/dashboard/",
  "/preview/",
  "/auth/",
  "/*/auth/",
  "/onboarding/",
  "/*/onboarding/",
  "/sponsor/",
  "/*/sponsor/",
  "/profile/",
  "/*/profile/",
  "/statistics/",
  "/*/statistics/",
  "/programs/*/session/",
  "/*/programs/*/session/",
  "/_next/",
  "/.*\\?"
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = workoutCoolPublicOrigin(process.env.NEXT_PUBLIC_APP_URL);

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: GATED_DISALLOWS,
        crawlDelay: 1
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: [
          "/admin/",
          "/*/admin/",
          "/api/",
          "/auth/",
          "/*/auth/",
          "/onboarding/",
          "/*/onboarding/",
          "/sponsor/",
          "/*/sponsor/",
          "/profile/",
          "/*/profile/",
          "/statistics/",
          "/*/statistics/",
          "/programs/*/session/",
          "/*/programs/*/session/"
        ]
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: [
          "/admin/",
          "/*/admin/",
          "/api/",
          "/auth/",
          "/*/auth/",
          "/onboarding/",
          "/*/onboarding/",
          "/sponsor/",
          "/*/sponsor/",
          "/profile/",
          "/*/profile/",
          "/statistics/",
          "/*/statistics/",
          "/programs/*/session/",
          "/*/programs/*/session/"
        ]
      }
    ],
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
