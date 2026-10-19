"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="tooltip tooltip-bottom" data-tip="Toggle theme">
        <Button className="!h-12 !w-12 !min-h-12 !min-w-12 !p-0 hover:!scale-100 hover:bg-slate-200 rounded-full" variant="ghost">
          <MoonIcon className="text-blue-500 dark:text-blue-400 h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="tooltip tooltip-bottom" data-tip={resolvedTheme === "light" ? "Dark mode" : "Light mode"}>
      <Button
        className="!h-12 !w-12 !min-h-12 !min-w-12 !p-0 hover:!scale-100 hover:bg-slate-200 rounded-full"
        onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
        variant="ghost"
      >
        {resolvedTheme === "light" ? (
          <MoonIcon className="text-blue-500 dark:text-blue-400 h-6 w-6" />
        ) : (
          <SunIcon className="text-blue-500 dark:text-blue-400 h-6 w-6" />
        )}
      </Button>
    </div>
  );
}
