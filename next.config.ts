import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parent folders (e.g. another package-lock.json up the tree) confuse Turbopack root detection otherwise.
  turbopack: {
    root: path.join(__dirname),
  },
  reactStrictMode: true,
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
