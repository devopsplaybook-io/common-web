export const THEME_KEY = "UI_THEME";

export const THEME_SCRIPT_KEY = "common-web-theme";

// Build-time CSP nonce forwarded to the inline pre-paint script. Per-request
// nonces require a consumer override using `themeInitScriptEntry(nonce)`.
export const THEME_SCRIPT_NONCE_ENV = "COMMON_WEB_THEME_SCRIPT_NONCE";

export function themeScriptNonceFromEnv(): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const nonce = process.env[THEME_SCRIPT_NONCE_ENV]?.trim();
  return nonce ? nonce : undefined;
}

export interface ThemeInitScriptEntry {
  [key: `data-${string}`]: string;
  key: string;
  innerHTML: string;
  nonce?: string;
}

export function themeInitScriptEntry(nonce?: string): ThemeInitScriptEntry {
  return nonce
    ? { key: THEME_SCRIPT_KEY, innerHTML: THEME_INIT_SCRIPT, nonce }
    : { key: THEME_SCRIPT_KEY, innerHTML: THEME_INIT_SCRIPT };
}

// Runs synchronously in <head> before first paint; must stay dependency-free.
// An explicit stored preference always wins over the OS scheme; re-reading
// localStorage on media changes keeps setTheme() authoritative afterwards.
export const THEME_INIT_SCRIPT = `(function () {
  var key = ${JSON.stringify(THEME_KEY)};
  function apply() {
    try {
      var stored = localStorage.getItem(key);
      var media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      var dark = stored === "dark" || (stored !== "light" && !!(media && media.matches));
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    } catch (error) {
      /* localStorage unavailable (privacy mode) */
    }
  }
  apply();
  try {
    var media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (media && media.addEventListener) media.addEventListener("change", apply);
  } catch (error) {
    /* no prefers-color-scheme support */
  }
})();`;
