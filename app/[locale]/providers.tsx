"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { I18nProviderClient } from "locales/client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { PropsWithChildren } from "react";

import { AnalyticsProvider } from "@/shared/lib/analytics/client";
import { EmbedBridge } from "@/features/embed/ui/embed-bridge";
import { DialogRenderer } from "@/features/dialogs-provider/DialogProvider";
import { useAutoLocale } from "@/entities/user/model/use-auto-locale";
import { ToastSonner } from "@/components/ui/ToastSonner";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ui/theme-provider";

const queryClient = new QueryClient();

function LocaleDetector() {
  useAutoLocale();
  return null;
}

export const Providers = ({ children, locale }: PropsWithChildren<{ locale: string }>) => {
  return (
    <>
      <AnalyticsProvider />
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          <I18nProviderClient locale={locale}>
            {/* Non-embed persistence stays on the default "theme" key. Embed mode remaps it. */}
            <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem storageKey="theme">
              <EmbedBridge />
              <LocaleDetector />
              <Toaster />
              <ToastSonner />
              <DialogRenderer />
              <ReactQueryDevtools initialIsOpen={false} />
              {children}
            </ThemeProvider>
          </I18nProviderClient>
        </QueryClientProvider>
      </NuqsAdapter>
    </>
  );
};
