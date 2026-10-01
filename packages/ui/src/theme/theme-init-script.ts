import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_META_COLORS, THEME_STORAGE_KEY } from "@subboost/ui/theme/theme";

const json = JSON.stringify;

/**
 * Runs synchronously in <head> before the page paints, so a stored light theme never flashes dark.
 * Mirrors parseTheme/applyTheme from theme.ts; theme.test.ts keeps both in sync.
 */
export const THEME_INIT_SCRIPT =
  "(function(){try{" +
  `var t=localStorage.getItem(${json(THEME_STORAGE_KEY)});` +
  `if(t!=="light"&&t!=="dark")t=${json(DEFAULT_THEME)};` +
  `var d=document.documentElement;d.setAttribute(${json(THEME_ATTRIBUTE)},t);` +
  `var m=document.querySelector('meta[name="theme-color"]');` +
  `if(m)m.setAttribute("content",t==="light"?${json(THEME_META_COLORS.light)}:${json(THEME_META_COLORS.dark)});` +
  "}catch(e){}})();";
