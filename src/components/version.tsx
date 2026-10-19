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
        "pointer-events-none absolute bottom-2 right-4 z-20 sm:left-4 sm:right-auto " +
        "max-sm:bottom-[var(--wc-nav-h)]"
      }
      data-wc-chrome="version"
    >
      <span className="text-lg leading-snug text-[var(--wc-dash-secondary)]">v{appVersion}</span>
    </div>
  );
};
