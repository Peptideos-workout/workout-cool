import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parent folders (e.g. another package-lock.json up the tree) confuse Turbopack root detection otherwise.
  turbopack: {
    root: path.join(__dirname),
  },
  // load-mdx.ts readFile's content/{slug}/{locale}.mdx at request time, which the tracer cannot see.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*.mdx"],
    "/[locale]/about": ["./content/**/*.mdx"],
    "/[locale]/legal/privacy": ["./content/**/*.mdx"],
    "/[locale]/legal/terms": ["./content/**/*.mdx"],
    "/[locale]/legal/sales-terms": ["./content/**/*.mdx"],
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:locale/auth/link-peptideos",
        headers: [{ key: "Cache-Control", value: "private, no-store" }]
      },
      {
        source: "/auth/link-peptideos",
        headers: [{ key: "Cache-Control", value: "private, no-store" }]
      },
      {
        source: "/api/peptideos-wc-sso/link",
        headers: [{ key: "Cache-Control", value: "private, no-store" }]
      }
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "http", hostname: "192.168.1.12" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "www.facebook.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "**.vercel.app" },
    ],
  },
};

export default nextConfig;
