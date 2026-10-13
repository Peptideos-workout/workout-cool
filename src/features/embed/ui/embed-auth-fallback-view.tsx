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
      <a className="text-base font-medium" href={dashboardHref} rel="noopener noreferrer" target="_top">
        {EMBED_BACK_TO_DASHBOARD}
      </a>
      <a className="text-base font-medium" href={loginHref} rel="noopener noreferrer" target="_top">
        {loginLabel}
      </a>
      <a className="text-base font-medium" href={signupHref} rel="noopener noreferrer" target="_top">
        {signupLabel}
      </a>
    </div>
  );
}
