import { safeWorkoutReturnTo } from "@/features/auth/lib/peptideos-signup-url";
import { stripLocalePrefix } from "@/features/auth/lib/locale-path";

const WC_HOME = "/";

function safeHomePath(homePath: string): string {
  if (!homePath.startsWith("/") || homePath.startsWith("//")) {
    return WC_HOME;
  }
  return homePath;
}

/** Same-origin cancel target for /auth/signout. Always a relative path; fail closed to WC home. */
export function signOutCancelHref(referer: string | undefined, appUrl: string, homePath = WC_HOME): string {
  const home = safeHomePath(homePath);

  try {
    const origin = new URL(appUrl).origin;
    const safe = safeWorkoutReturnTo(referer, origin);
    if (!safe) {
      return home;
    }

    const url = new URL(safe);
    if (stripLocalePrefix(url.pathname) === "/auth/signout") {
      return home;
    }

    return `${url.pathname}${url.search}${url.hash}` || home;
  } catch {
    return home;
  }
}
