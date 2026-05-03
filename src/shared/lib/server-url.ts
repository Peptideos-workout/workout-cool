import { SiteConfig } from "@/shared/config/site-config";

/**
 * Public site origin for metadata, auth callbacks, and redirects.
 * On the server (SSR / Route Handlers), never assume localhost when `NEXT_PUBLIC_APP_URL` or `BETTER_AUTH_URL`
 * is set — Docker / self-host is not Vercel, and the old default caused redirects to `http://localhost:3000`.
 */
export const getServerUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (process.env.VERCEL_ENV === "production") {
    return SiteConfig.prodUrl;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      /* ignore */
    }
  }

  return "http://localhost:3000";
};
