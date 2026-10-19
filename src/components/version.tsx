import { appVersion } from "@/shared/lib/version";

interface VersionProps {
  variant?: "chip" | "meta";
}

/** Chip sits in the card, above the page. Meta is the embed line and stays hidden outside the frame. */
export const Version = ({ variant = "chip" }: VersionProps) => {
  if (variant === "meta") {
    return (
      <p className="hidden" data-wc-version-meta="">
        v{appVersion}
      </p>
    );
  }

  return (
    <div className="pointer-events-none relative z-20 w-fit self-start px-3 pt-2" data-wc-chrome="version">
      <span className="text-lg leading-snug text-[var(--wc-dash-secondary)]">v{appVersion}</span>
    </div>
  );
};
