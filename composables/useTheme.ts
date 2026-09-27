import { computed, onMounted, onUnmounted, ref } from "vue";

export type ThemePreference = "light" | "dark" | "system";

const THEME_KEY = "UI_THEME";

export function useTheme() {
  const preference = ref<ThemePreference>("system");
  const isDark = computed(() => preference.value === "dark");
  let mediaQuery: MediaQueryList | undefined;

  function applyTheme(): void {
    if (typeof document === "undefined") return;

    const prefersDark = mediaQuery?.matches ?? false;
    const theme =
      preference.value === "system"
        ? prefersDark
          ? "dark"
          : "light"
        : preference.value;
    document.documentElement.setAttribute("data-theme", theme);
  }

  function setTheme(theme: ThemePreference): void {
    preference.value = theme;
    if (typeof localStorage !== "undefined") {
      if (theme === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    }
    applyTheme();
  }

  function toggleTheme(): void {
    setTheme(isDark.value ? "light" : "dark");
  }

  function handleSystemThemeChange(): void {
    if (preference.value === "system") applyTheme();
  }

  onMounted(() => {
    const storedTheme = localStorage.getItem(THEME_KEY);
    preference.value =
      storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
    mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    mediaQuery?.addEventListener?.("change", handleSystemThemeChange);
    applyTheme();
  });

  onUnmounted(() => {
    mediaQuery?.removeEventListener?.("change", handleSystemThemeChange);
  });

  return { preference, isDark, setTheme, toggleTheme };
}
