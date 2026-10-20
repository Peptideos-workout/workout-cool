"use client";

import Image from "next/image";
import { LogOut, User, Crown, Sparkles } from "lucide-react";
import { useI18n } from "locales/client";
import Logo from "@public/logo.png";

import { LanguageSelector } from "@/widgets/language-selector/language-selector";
import { useIsPremium } from "@/shared/lib/premium/use-premium";
import { SiteConfig } from "@/shared/config/site-config";
import { ChangePasswordMenuItem } from "@/features/update-password/ui/change-password-menu-item";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import WorkoutStreakHeader from "@/features/layout/workout-streak-header";
import { headerAuthChrome } from "@/features/layout/lib/header-auth-chrome";
import { assignCheckoutUrl } from "@/features/embed/lib/embed-mode";
import { useLogout } from "@/features/auth/model/useLogout";
import { getConfiguredPeptideOsLoginUrl, getConfiguredPeptideOsSignupUrl } from "@/features/auth/lib/configured-peptideos-signup";
import { useSession } from "@/features/auth/lib/auth-client";
import { env } from "@/env";
import { Link } from "@/components/ui/link";
import { RemoveAdsText } from "@/components/premium/RemoveAdsText";

export const Header = () => {
  const session = useSession();
  const logout = useLogout();
  const t = useI18n();
  const isPremium = useIsPremium();
  const authChrome = headerAuthChrome(session.isPending, Boolean(session.data));

  // Get user initials for avatar
  const userAvatar = session.data?.user?.email?.substring(0, 2).toUpperCase() || "";

  const allFeaturesFree = SiteConfig.allPremiumFeaturesFree;
  const showAds = env.NEXT_PUBLIC_SHOW_ADS === true;
  const hasAdProvider = env.NEXT_PUBLIC_AD_CLIENT || env.NEXT_PUBLIC_AD_PROVIDER === "ezoic";

  const handleSignOut = () => {
    logout.mutate();
  };

  const handleCloseDropdown = () => {
    const element = document.activeElement as HTMLElement;
    if (!element) return;
    element.blur();
  };

  const publicSignupClass =
    "!inline-flex !h-auto !min-h-12 !min-w-12 !shrink-0 items-center justify-center whitespace-nowrap rounded-2xl border-0 " +
    "bg-[var(--wc-dash-accent)] px-4 !text-lg !font-bold !leading-none !text-[var(--wc-dash-ink)] !no-underline " +
    "shadow-none hover:bg-[var(--wc-dash-accent)] " +
    "dark:shadow-[0_0_22px_color-mix(in_srgb,var(--wc-dash-accent)_55%,transparent)]";

  return (
    <>
      <div
        className="navbar h-auto flex-wrap gap-y-2 rounded-tl-lg rounded-tr-lg bg-base-100 px-2 dark:bg-black dark:text-gray-200 sm:px-4 max-sm:shrink-0 max-sm:overflow-x-clip"
        data-wc-chrome="header"
      >
        {/* Logo and Title */}
        <div className="navbar-start order-1 !w-auto shrink-0 flex items-center gap-1">
          <Link
            className="group flex items-center gap-2 rounded-xl bg-gradient-to-r px-1 sm:px-4 py-2 transition-all duration-200 dark:text-gray-200 dark:bg-gray-800"
            href="/"
          >
            <div className="relative flex-none">
              <Image
                alt="WorkoutOS logo"
                className="h-10 w-10 sm:h-8 sm:w-8 transition-transform duration-200 group-hover:rotate-[20deg] group-hover:scale-110"
                height={32}
                priority
                src={Logo}
                width={32}
              />
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100"></div>
            </div>
            <div className="flex-col hidden sm:flex">
              <span className="text-lg font-bold transition-colors duration-200 group-hover:text-blue-400">WorkoutOS</span>
            </div>
          </Link>
        </div>

        <div className="order-3 flex min-w-0 max-w-full justify-end max-[447px]:basis-full min-[448px]:order-2 min-[448px]:w-auto">
          {allFeaturesFree || isPremium || !showAds || !hasAdProvider ? <WorkoutStreakHeader /> : <RemoveAdsText />}
        </div>

        {/* User Menu */}
        <div className="navbar-end order-2 !h-auto !w-auto min-w-0 flex-1 flex-wrap justify-end gap-y-1 min-[448px]:order-3">
          <div className="inline-flex !min-h-12 !min-w-12 items-center justify-center">
            <ThemeToggle />
          </div>
          <div className="inline-flex !min-h-12 !min-w-12 items-center justify-center">
            <LanguageSelector />
          </div>

          {authChrome === "pending" ? (
            <div
              aria-hidden="true"
              className="ml-1 flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-2"
              data-wc-header-auth="pending"
            >
              <span className="inline-flex h-12 min-h-12 min-w-12 shrink-0 rounded-2xl border border-[var(--wc-dash-secondary)] bg-[var(--wc-dash-panel)]" />
              <span className="inline-flex h-12 min-h-12 min-w-[6.5rem] shrink-0 rounded-2xl border border-[var(--wc-dash-secondary)] bg-[var(--wc-dash-panel)]" />
            </div>
          ) : authChrome === "signed-out" ? (
            <div className="ml-1 flex max-w-full flex-wrap items-center justify-end gap-1 sm:gap-2">
              <Link
                className="!inline-flex !min-h-12 !min-w-12 !shrink-0 items-center justify-center !text-lg !no-underline px-2 text-center"
                href={getConfiguredPeptideOsLoginUrl()}
                prefetch={false}
                size="sm"
                variant="nav"
              >
                {t("commons.login")}
              </Link>
              <Link
                className={publicSignupClass}
                href={getConfiguredPeptideOsSignupUrl()}
                prefetch={false}
                size="lg"
                variant="button"
              >
                {t("commons.signup")}
              </Link>
            </div>
          ) : (
            <div className="dropdown dropdown-end ml-1">
              <div className="tooltip tooltip-bottom" data-tip={t("commons.profile")}>
                <div className="btn btn-ghost btn-circle avatar relative !min-h-12 !min-w-12" role="button" tabIndex={0}>
                  <div className="w-8 rounded-full bg-primary text-primary-content !flex items-center justify-center text-sm font-medium">
                    {userAvatar || <User className="w-4 h-4" />}
                  </div>
                  {!allFeaturesFree && isPremium && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full !flex items-center justify-center">
                      <Crown className="w-2.5 h-2.5 text-amber-900" />
                    </div>
                  )}
                </div>
              </div>

              <ul
                className="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 dark:bg-black dark:text-gray-200 rounded-box w-52 border border-slate-200 dark:border-gray-800"
                onClick={handleCloseDropdown}
                tabIndex={0}
              >
                <li>
                  <Link className="!no-underline min-h-12 text-lg" href="/profile" size="base" variant="nav">
                    <User className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                    {t("commons.profile")}
                  </Link>
                </li>
                <ChangePasswordMenuItem />

                {!allFeaturesFree && (
                  <li>
                    <Link
                      className="!no-underline min-h-12 text-lg"
                      data-wc-entry="premium"
                      href={isPremium ? "/api/premium/billing-portal" : "/premium"}
                      size="base"
                      variant="nav"
                      {...(isPremium && {
                        onClick: async (e) => {
                          e.preventDefault();
                          try {
                            const response = await fetch("/api/premium/billing-portal", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ returnUrl: window.location.origin + "/profile" }),
                            });
                            const data = await response.json();
                            if (data.success && data.url) {
                              assignCheckoutUrl(data.url);
                            }
                          } catch (error) {
                            console.error("Error opening billing portal:", error);
                          }
                        },
                      })}
                    >
                      {isPremium ? (
                        <>
                          <Crown className="w-4 h-4 text-amber-500" />
                          {t("commons.manage_subscription")}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-purple-500" />
                          {t("commons.remove_ads")}
                        </>
                      )}
                    </Link>
                  </li>
                )}

                <hr className="my-1 border-slate-200 dark:border-gray-800" />

                <li>
                  <button
                    className="flex min-h-12 items-center gap-2 text-lg text-gray-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-800 rounded-lg px-3 py-2 transition-colors"
                    data-wc-signout=""
                    onClick={handleSignOut}
                  >
                    <LogOut className="w-4 h-4" />
                    {t("commons.logout")}
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
