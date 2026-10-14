import { useTheme } from "next-themes";

export function useChartTheme() {
  const { theme, systemTheme } = useTheme();
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = currentTheme === "dark";

  return {
    isDark,
    colors: {
      background: isDark ? "var(--wc-dash-panel)" : "var(--wc-dash-panel)",
      cardBackground: isDark ? "var(--wc-dash-card)" : "var(--wc-dash-card)",
      text: isDark ? "var(--wc-dash-text)" : "var(--wc-dash-text)",
      textSecondary: isDark ? "var(--wc-dash-secondary)" : "var(--wc-dash-secondary)",
      textMuted: isDark ? "var(--wc-dash-secondary)" : "var(--wc-dash-secondary)",
      border: isDark ? "var(--wc-dash-border)" : "var(--wc-dash-border)",
      grid: isDark ? "var(--wc-dash-border)" : "var(--wc-dash-border)",
      tooltipBackground: isDark ? "var(--wc-dash-panel)" : "var(--wc-dash-panel)",
      tooltipBorder: isDark ? "var(--wc-dash-border)" : "var(--wc-dash-border)",
    },
  };
}
