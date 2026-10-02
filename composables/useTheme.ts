import { computed, onMounted, onUnmounted, ref } from "vue";

export type ThemePreference = "light" | "dark" | "system";

const THEME_KEY = "UI_THEME";

export function useTheme() {
  const preference = ref<ThemePreference>("system");
  const systemPrefersDark = ref(false);
  const isDark = computed(
    () =>
      preference.value === "dark" ||
      (preference.value === "system" && systemPrefersDark.value),
  );
  let mediaQuery: MediaQueryList | undefined;

  function applyTheme(): void {
    if (typeof document === "undefined") return;

    const theme =
      preference.value === "system"
        ? systemPrefersDark.value
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

  function handleSystemThemeChange(event: MediaQueryListEvent): void {
    systemPrefersDark.value = event.matches;
    if (preference.value === "system") applyTheme();
  }

  onMounted(() => {
    const storedTheme = localStorage.getItem(THEME_KEY);
    preference.value =
      storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
    mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    systemPrefersDark.value = mediaQuery?.matches ?? false;
    mediaQuery?.addEventListener?.("change", handleSystemThemeChange);
    applyTheme();
  });

  onUnmounted(() => {
    mediaQuery?.removeEventListener?.("change", handleSystemThemeChange);
  });

  return { preference, isDark, setTheme, toggleTheme };
}
