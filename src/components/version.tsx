import { appVersion } from "@/shared/lib/version";

export const Version = () => (
  <div className="absolute bottom-2 right-4" data-wc-chrome="version">
    <span className="text-xs text-gray-500 dark:text-gray-600/50">
      v{appVersion}
    </span>
  </div>

);