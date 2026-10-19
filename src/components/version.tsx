import { appVersion } from "@/shared/lib/version";

interface VersionProps {
  variant?: "chip" | "meta";
}

/** Chip is the public overlay. Meta is the embed line and stays hidden outside the frame. */
export const Version = ({ variant = "chip" }: VersionProps) => {
  if (variant === "meta") {
    return (
      <p className="hidden" data-wc-version-meta="">
        v{appVersion}
      </p>
    );
  }

  return (
    <div
      className={
        "pointer-events-none absolute left-1/2 z-20 w-full max-w-3xl -translate-x-1/2 px-4 " +
        "max-sm:bottom-[calc(var(--wc-nav-h)+env(safe-area-inset-bottom)+168px)] sm:bottom-36"
      }
      data-wc-chrome="version"
    >
      <span className="text-lg leading-snug text-[var(--wc-dash-secondary)]">v{appVersion}</span>
    </div>
  );
};
