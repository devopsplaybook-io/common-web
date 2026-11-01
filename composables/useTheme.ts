import { computed, onMounted, onUnmounted, ref } from "vue";
import { BrowserStorage } from "../services/BrowserStorage";
import { THEME_KEY } from "./theme";

export type ThemePreference = "light" | "dark" | "system";

// Module-level so every `useTheme()` call and every tab observes one state.
const preference = ref<ThemePreference>("system");
const systemPrefersDark = ref(false);
const isDark = computed(
  () =>
    preference.value === "dark" ||
    (preference.value === "system" && systemPrefersDark.value),
);

let mountedConsumers = 0;
let mediaQuery: MediaQueryList | undefined;

function storedPreference(): ThemePreference {
  const stored = BrowserStorage.get(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(): void {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute(
    "data-theme",
    isDark.value ? "dark" : "light",
  );
}

function setTheme(theme: ThemePreference): void {
  preference.value = theme;
  if (theme === "system") BrowserStorage.remove(THEME_KEY);
  else BrowserStorage.set(THEME_KEY, theme);
  applyTheme();
}

function toggleTheme(): void {
  setTheme(isDark.value ? "light" : "dark");
}

function handleSystemThemeChange(event: MediaQueryListEvent): void {
  systemPrefersDark.value = event.matches;
  if (preference.value === "system") applyTheme();
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== THEME_KEY) return;
  preference.value = storedPreference();
  applyTheme();
}

function registerListeners(): void {
  mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  systemPrefersDark.value = mediaQuery?.matches ?? false;
  mediaQuery?.addEventListener?.("change", handleSystemThemeChange);
  window.addEventListener("storage", handleStorage);
}

function unregisterListeners(): void {
  mediaQuery?.removeEventListener?.("change", handleSystemThemeChange);
  mediaQuery = undefined;
  window.removeEventListener("storage", handleStorage);
}

export function useTheme() {
  onMounted(() => {
    if (mountedConsumers === 0) {
      preference.value = storedPreference();
      registerListeners();
      applyTheme();
    }
    mountedConsumers += 1;
  });

  onUnmounted(() => {
    mountedConsumers = Math.max(0, mountedConsumers - 1);
    if (mountedConsumers === 0) unregisterListeners();
  });

  return { preference, isDark, setTheme, toggleTheme };
}
