import { SUBBOOST_THEME_COLOR } from "@subboost/ui/brand";

export type ThemeName = "dark" | "light";

export const THEME_STORAGE_KEY = "subboost-theme";
export const THEME_ATTRIBUTE = "data-theme";
export const DEFAULT_THEME: ThemeName = "dark";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: light)";
export const THEME_META_COLORS: Record<ThemeName, string> = {
  dark: SUBBOOST_THEME_COLOR,
  light: "#F6F8FC",
};

export function parseTheme(value: unknown): ThemeName | null {
  return value === "dark" || value === "light" ? value : null;
}

export function readStoredTheme(): ThemeName | null {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function getSystemThemeQuery(): MediaQueryList | null {
  try {
    return window.matchMedia(SYSTEM_THEME_QUERY);
  } catch {
    return null;
  }
}

export function getSystemTheme(): ThemeName {
  return getSystemThemeQuery()?.matches ? "light" : DEFAULT_THEME;
}

export function persistTheme(theme: ThemeName): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice still applies to this page.
  }
}

export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  root.setAttribute(THEME_ATTRIBUTE, theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_META_COLORS[theme]);
}

export function getCurrentTheme(): ThemeName {
  return parseTheme(document.documentElement.getAttribute(THEME_ATTRIBUTE)) ?? DEFAULT_THEME;
}
