"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";

import { resolveEmbedOutboundOrigins } from "@/features/embed/lib/embed-mode";
import { startEmbedBridge } from "@/features/embed/lib/embed-bridge";

/** Child side of the PeptideOS frame bridge. No-ops outside embed mode. */
export function EmbedBridge() {
  const pathname = usePathname();
  const { setTheme } = useTheme();

  useEffect(() => {
    const outboundOrigins = resolveEmbedOutboundOrigins({
      referrer: document.referrer,
      ancestorOrigins: (window.location as Location & { ancestorOrigins?: ArrayLike<string> }).ancestorOrigins ?? null
    });
    return startEmbedBridge({
      parentOrigin: outboundOrigins[0] ?? "https://peptideos.us",
      outboundOrigins,
      isEmbed: () => document.documentElement.getAttribute("data-wc-embed") === "1",
      isTopLevel: () => window.parent === window,
      parent: window.parent,
      readHeight: () => document.documentElement.scrollHeight,
      readPath: () => `${window.location.pathname}${window.location.search}`,
      subscribeResize: (notify) => {
        const observer = new ResizeObserver(() => notify());
        observer.observe(document.documentElement);
        return () => observer.disconnect();
      },
      subscribePath: (notify) => {
        window.addEventListener("popstate", notify);
        return () => window.removeEventListener("popstate", notify);
      },
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      setTheme: (theme) => setTheme(theme),
      addMessageListener: (listener) => {
        const onMessage = (event: MessageEvent) => {
          listener({ data: event.data, origin: event.origin, source: event.source });
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
      }
    });
  }, [pathname, setTheme]);

  return null;
}
