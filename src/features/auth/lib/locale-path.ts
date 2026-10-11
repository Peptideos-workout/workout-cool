function stripQueryAndHash(path: string): string {
  return path.split("?")[0].split("#")[0];
}

function stripTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path;
}

/** Locale-agnostic `/xx` or `/xx-yy` prefix (any case), e.g. `/zh-cn`, `/ZH-CN`. */
const LOCALE_PREFIX = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i;

export function stripLocalePrefix(pathname: string): string {
  const cleaned = stripTrailingSlash(stripQueryAndHash(pathname.trim()) || "/");
  const withoutLocale = cleaned.replace(LOCALE_PREFIX, "");
  if (!withoutLocale || withoutLocale === "/") {
    return "/";
  }
  return stripTrailingSlash(withoutLocale.startsWith("/") ? withoutLocale : `/${withoutLocale}`) || "/";
}
