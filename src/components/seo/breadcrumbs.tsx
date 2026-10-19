"use client";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

import { StructuredDataScript } from "@/shared/lib/structured-data";
import { SiteConfig } from "@/shared/config/site-config";

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const siteOrigin = SiteConfig.prodUrl.replace(/\/$/, "");
  // Generate BreadcrumbList structured data
  const breadcrumbStructuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteOrigin}${item.href}` : undefined,
    })),
  };

  return (
    <>
      <StructuredDataScript data={breadcrumbStructuredData} />
      <nav aria-label="Breadcrumb" className="m-2 flex min-h-12 items-center">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 sm:gap-x-2">
          {items.map((item, index) => (
            <li className="flex items-center" key={index}>
              {index > 0 && <ChevronRight aria-hidden="true" className="h-4 w-4 text-[var(--wc-dash-secondary)]" />}
              {item.current ? (
                <span aria-current="page" className="text-lg font-medium text-[var(--wc-dash-text)]">
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  className={
                    "inline-flex min-h-12 items-center text-lg transition-colors hover:text-[var(--wc-dash-text)]" +
                    (index === 0 ? " text-[var(--wc-dash-secondary)]" : " text-[var(--wc-dash-text)]")
                  }
                  href={item.href}
                >
                  {index === 0 ? (
                    <span className="flex items-center">
                      <Home aria-hidden="true" className="h-4 w-4 mr-1" />
                      {item.label}
                    </span>
                  ) : (
                    item.label
                  )}
                </Link>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
