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
    <div className="absolute bottom-2 right-4" data-wc-chrome="version">
      <span className="text-xs text-gray-500 dark:text-gray-600/50">v{appVersion}</span>
    </div>
  );
};