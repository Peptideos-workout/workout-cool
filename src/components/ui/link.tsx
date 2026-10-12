import { forwardRef } from "react";
import NextLink from "next/link";

import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

interface LinkProps extends ComponentProps<typeof NextLink> {
  variant?: "default" | "nav" | "footer" | "button";
  size?: "sm" | "base" | "lg";
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, href, prefetch, variant = "default", size = "base", children, ...props }, ref) => {
    const variants = {
      default: "link link-hover text-base-content hover:text-primary transition-colors dark:text-gray-200 dark:hover:text-primary",
      nav: "link link-hover text-base-content/80 hover:text-base-content transition-colors dark:text-gray-200 dark:hover:text-primary",
      footer: "link link-hover text-base-content/70 hover:text-base-content transition-colors dark:text-gray-200 dark:hover:text-primary",
      button: "btn btn-link no-underline hover:underline",
    };

    const sizes = {
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
    };

    const disableCrossOriginPrefetch =
      prefetch ?? (typeof href === "string" && /^https?:\/\//i.test(href) ? false : undefined);

    return (
      <NextLink className={cn(variants[variant], sizes[size], className)} href={href} prefetch={disableCrossOriginPrefetch} ref={ref} {...props}>
        {children}
      </NextLink>
    );
  },
);

Link.displayName = "Link";
