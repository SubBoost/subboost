"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@subboost/ui/components/ui/icon-button";
import {
  applyTheme,
  DEFAULT_THEME,
  getCurrentTheme,
  getSystemTheme,
  getSystemThemeQuery,
  parseTheme,
  persistTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  type ThemeName,
} from "@subboost/ui/theme/theme";

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeName>(DEFAULT_THEME);
  const manualTheme = React.useRef<ThemeName | null>(null);

  React.useEffect(() => {
    manualTheme.current = readStoredTheme();
    const syncTheme = (next: ThemeName) => {
      applyTheme(next);
      setTheme(next);
    };
    // The init script may run before <meta name="theme-color"> exists; apply again to sync it.
    syncTheme(manualTheme.current ?? getSystemTheme());

    const media = getSystemThemeQuery();
    const onSystemChange = () => {
      if (manualTheme.current === null) syncTheme(getSystemTheme());
    };
    if (media?.addEventListener) media.addEventListener("change", onSystemChange);
    else media?.addListener?.(onSystemChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      if (event.storageArea) {
        try {
          if (event.storageArea !== window.localStorage) return;
        } catch {
          return;
        }
      }
      manualTheme.current = event.key === null ? null : parseTheme(event.newValue);
      syncTheme(manualTheme.current ?? getSystemTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (media?.addEventListener) media.removeEventListener("change", onSystemChange);
      else media?.removeListener?.(onSystemChange);
    };
  }, []);

  const toggle = () => {
    const next: ThemeName = getCurrentTheme() === "light" ? "dark" : "light";
    // Keep the choice in memory even when persistence is blocked.
    manualTheme.current = next;
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
