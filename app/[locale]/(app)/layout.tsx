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
        "mx-auto card flex w-full max-w-3xl min-h-[500px] flex-col rounded-lg border border-base-200 bg-white shadow-xl " +
        "max-sm:min-h-screen max-sm:rounded-none max-sm:pb-[var(--wc-nav-h)] dark:border-slate-700 dark:bg-[#232324]"
      }
      data-wc-shell=""
    >
      <Suspense fallback={null}>
        <EmbedAuthFallback />
      </Suspense>
      <Header />
      <div className="flex-1 flex flex-col max-sm:pb-[var(--wc-nav-h)]" data-wc-main="">
        {children}
        <Version variant="meta" />
      </div>
      <BottomNavigation />
      <Footer />
    </div>
  );
}
