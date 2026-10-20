import { EMBED_BACK_TO_DASHBOARD } from "@/features/embed/lib/embed-mode";

interface EmbedAuthFallbackViewProps {
  dashboardHref: string;
  loginHref: string;
  loginLabel: string;
  signupHref: string;
  signupLabel: string;
}

/** Log in and Sign up break out of the frame. The back label is fixed copy. */
export function EmbedAuthFallbackView({
  dashboardHref,
  loginHref,
  loginLabel,
  signupHref,
  signupLabel
}: EmbedAuthFallbackViewProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3" data-wc-embed-fallback="">
      <a className="inline-flex min-h-12 items-center text-lg font-bold" href={dashboardHref} rel="noopener noreferrer" target="_top">
        {EMBED_BACK_TO_DASHBOARD}
      </a>
      <a className="inline-flex min-h-12 items-center text-lg font-bold" href={loginHref} rel="noopener noreferrer" target="_top">
        {loginLabel}
      </a>
      <a className="inline-flex min-h-12 items-center text-lg font-bold" href={signupHref} rel="noopener noreferrer" target="_top">
        {signupLabel}
      </a>
    </div>
  );
}
