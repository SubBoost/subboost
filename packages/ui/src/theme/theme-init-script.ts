import { DEFAULT_THEME, SYSTEM_THEME_QUERY, THEME_ATTRIBUTE, THEME_META_COLORS, THEME_STORAGE_KEY } from "@subboost/ui/theme/theme";

const json = JSON.stringify;

/**
 * Runs synchronously in <head> before paint, preferring a manual choice over the system theme.
 * Mirrors parseTheme/getSystemTheme/applyTheme; theme.test.ts keeps both in sync.
 */
export const THEME_INIT_SCRIPT =
  "(function(){try{var t;try{" +
  `t=window.localStorage.getItem(${json(THEME_STORAGE_KEY)});` +
  "}catch(e){}" +
  `if(t!=="light"&&t!=="dark"){t=${json(DEFAULT_THEME)};try{` +
  `if(window.matchMedia(${json(SYSTEM_THEME_QUERY)}).matches)t="light";` +
  "}catch(e){}}" +
  `var d=document.documentElement;d.setAttribute(${json(THEME_ATTRIBUTE)},t);` +
  `var m=document.querySelector('meta[name="theme-color"]');` +
  `if(m)m.setAttribute("content",t==="light"?${json(THEME_META_COLORS.light)}:${json(THEME_META_COLORS.dark)});` +
  "}catch(e){}})();";
