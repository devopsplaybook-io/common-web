export const THEME_KEY = "UI_THEME";

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
