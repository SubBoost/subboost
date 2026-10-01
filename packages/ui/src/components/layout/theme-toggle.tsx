"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import {
  applyTheme,
  DEFAULT_THEME,
  getCurrentTheme,
  parseTheme,
  persistTheme,
  THEME_STORAGE_KEY,
  type ThemeName,
} from "@subboost/ui/theme/theme";

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeName>(DEFAULT_THEME);

  React.useEffect(() => {
    const current = getCurrentTheme();
    // The init script may run before <meta name="theme-color"> exists; apply again to sync it.
    applyTheme(current);
    setTheme(current);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = parseTheme(event.newValue) ?? DEFAULT_THEME;
      applyTheme(next);
      setTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = () => {
    const next: ThemeName = getCurrentTheme() === "light" ? "dark" : "light";
    applyTheme(next);
    persistTheme(next);
    setTheme(next);
  };

  return (
    <IconButton
      label="浅色主题"
      title={theme === "light" ? "切换到深色" : "切换到浅色"}
      variant="ghost"
      aria-pressed={theme === "light"}
      className="rounded-lg p-2 transition-colors"
      onClick={toggle}
    >
      <Sun aria-hidden="true" className="theme-when-dark h-5 w-5 text-fg-60" />
      <Moon aria-hidden="true" className="theme-when-light h-5 w-5 text-fg-60" />
    </IconButton>
  );
}
