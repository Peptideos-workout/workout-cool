import { safeWorkoutReturnTo } from "@/features/auth/lib/peptideos-signup-url";
import { stripLocalePrefix } from "@/features/auth/lib/locale-path";

const WC_HOME = "/";
const MAX_URI_DECODE_ROUNDS = 8;

function safeHomePath(homePath: string): string {
  if (!homePath.startsWith("/") || homePath.startsWith("//")) {
    return WC_HOME;
  }
  return homePath;
}

function loopDecodeUri(value: string): string | null {
  let current = value;
  for (let i = 0; i < MAX_URI_DECODE_ROUNDS; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) {
      return current;
    }
    current = next;
  }
  return null;
}

/** `/` or `/` + a non-slash. Rejects `//host` protocol-relative paths after decode. */
function isSafeRelativePathname(pathname: string): boolean {
  const decoded = loopDecodeUri(pathname);
  if (decoded === null) {
    return false;
  }

  const normalized = decoded.replace(/\\/g, "/");
  if (normalized === "/") {
    return true;
  }

  return normalized.startsWith("/") && normalized[1] !== "/";
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

    if (!isSafeRelativePathname(url.pathname)) {
      return home;
    }

    return `${url.pathname}${url.search}${url.hash}` || home;
  } catch {
    return home;
  }
}
