import { Suspense, type ReactNode } from "react";

import { Header } from "@/features/layout/Header";
import { Footer } from "@/features/layout/Footer";
import { BottomNavigation } from "@/features/layout/BottomNavigation";
import { EmbedAuthFallback } from "@/features/embed/ui/embed-auth-fallback";
import { Version } from "@/components/version";

interface RootLayoutProps {
  params: Promise<{ locale: string }>;
  children: ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <div
      className={
        "card mx-auto flex w-full max-w-3xl min-h-[500px] flex-col rounded-lg border border-base-200 bg-white shadow-xl " +
        "dark:border-slate-700 dark:bg-[#232324] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:min-h-0 " +
        "max-sm:overflow-hidden max-sm:rounded-none"
      }
      data-wc-shell=""
    >
      <Suspense fallback={null}>
        <EmbedAuthFallback />
      </Suspense>
      <Header />
      <div className="flex flex-1 flex-col max-sm:order-1 max-sm:min-h-0 overflow-auto max-sm:pb-4" data-wc-main="">
        {children}
        <Version variant="meta" />
      </div>
      <BottomNavigation />
      <Footer />
    </div>
  );
}
