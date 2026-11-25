/**
 * Host modes exercised by the browser theme-contrast harness.
 *
 * Every palette is documented here so the tests can (a) prove the fixture
 * exposes the values it claims and (b) pin each measured colour back to the
 * host token the component is supposed to use.
 */

export type ColorScheme = "light" | "dark";

export const AA_MINIMUM = 4.5;
/** Documented exemption: Planner's light `--color-text-muted` is 4.41:1 on the
 * card surface and 4.01:1 on the derived raised panel, below AA 4.5. The
 * component cannot exceed a host token, so the partial-light muted pairs get a
 * 3.9 floor. Raising the token is a Planner change. */
export const PARTIAL_LIGHT_MUTED_FLOOR = 3.9;

export interface ExpectedColors {
  text: string;
  muted: string;
  onPrimary: string;
  surface: string;
  primary: string;
  warning: string;
  danger: string;
  success: string;
}

export type ExpectedKey = keyof ExpectedColors;

export interface HostMode {
  id: string;
  url: string;
  colorScheme: ColorScheme;
  /** Set for the Nuxt layer host: the theme the pre-paint script must apply. */
  layerTheme?: ColorScheme;
  /** CSS custom properties the page must expose, with their documented value. */
  fixtureTokens: Record<string, string>;
  /** Effective token colours the components must render. */
  expected: ExpectedColors;
  /** Per-pair minimum contrast overrides (pair id => ratio). */
  minimums?: Record<string, number>;
}

/** Ports are only a local detail; the defaults match playwright.config.ts, and
 * the env overrides let a developer run the suite next to a lingering server. */
function configuredPort(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const FIXTURE_ORIGIN = `http://127.0.0.1:${configuredPort("THEME_FIXTURE_PORT", 4310)}`;
const LAYER_ORIGIN = `http://127.0.0.1:${configuredPort("THEME_LAYER_PORT", 4311)}`;

/** Planner's dark palette only: no `--color-surface-raised`, `--color-error`,
 * `--color-on-warning`, `--space-base`; no common-web `tokens.css`. */
const PARTIAL_DARK_TOKENS: Record<string, string> = {
  "--color-primary": "#4fb3e8",
  "--color-primary-hover": "#74c4ee",
  "--color-on-primary": "#06222f",
  "--color-text": "#d7dee4",
  "--color-text-secondary": "#b6c2cc",
  "--color-text-muted": "#8a99a6",
  "--color-surface": "#1b242c",
  "--color-surface-hover": "#232e38",
  "--color-bg": "#12191f",
  "--color-border": "#2e3a44",
  "--color-border-strong": "#43525e",
  "--color-success": "#66bb6a",
  "--color-warning": "#ffb74d",
  "--color-danger": "#ef5350",
  "--space-md": "1em",
};

/** Planner's light palette only, same omissions. */
const PARTIAL_LIGHT_TOKENS: Record<string, string> = {
  "--color-primary": "#0f6da0",
  "--color-primary-hover": "#0c5c88",
  "--color-on-primary": "#ffffff",
  "--color-text": "#1d2832",
  "--color-text-secondary": "#455869",
  "--color-text-muted": "#6b7a88",
  "--color-surface": "#ffffff",
  "--color-surface-hover": "#eef1f4",
  "--color-bg": "#f4f6f8",
  "--color-border": "#dbe1e7",
  "--color-border-strong": "#b9c3cd",
  "--color-success": "#2e7d32",
  "--color-warning": "#b26a00",
  "--color-danger": "#c62828",
  "--space-md": "1em",
};

const PARTIAL_DARK_EXPECTED: ExpectedColors = {
  text: "#d7dee4",
  muted: "#8a99a6",
  onPrimary: "#06222f",
  surface: "#1b242c",
  primary: "#4fb3e8",
  warning: "#ffb74d",
  danger: "#ef5350",
  success: "#66bb6a",
};

const PARTIAL_LIGHT_EXPECTED: ExpectedColors = {
  text: "#1d2832",
  muted: "#6b7a88",
  onPrimary: "#ffffff",
  surface: "#ffffff",
  primary: "#0f6da0",
  warning: "#b26a00",
  danger: "#c62828",
  success: "#2e7d32",
};

/** Token-less host: the components' documented `light-dark()` fallbacks. */
const TOKENLESS_LIGHT_EXPECTED: ExpectedColors = {
  text: "#171717",
  muted: "#5f6368",
  onPrimary: "#ffffff",
  surface: "#ffffff",
  primary: "#c62828",
  warning: "#8a5a00",
  danger: "#b3261e",
  success: "#2e7d32",
};

const TOKENLESS_DARK_EXPECTED: ExpectedColors = {
  text: "#d7dee4",
  muted: "#8a99a6",
  onPrimary: "#171717",
  surface: "#1b242c",
  primary: "#ff8a80",
  warning: "#f0b429",
  danger: "#ff8a80",
  success: "#66bb6a",
};

/** common-web `assets/css/tokens.css` light block. */
const LAYER_LIGHT_TOKENS: Record<string, string> = {
  "--color-primary": "#c62828",
  "--color-primary-hover": "#a61f1f",
  "--color-on-primary": "#ffffff",
  "--color-text": "#171717",
  "--color-text-muted": "#5f6368",
  "--color-surface": "#ffffff",
  "--color-surface-raised": "#f5f5f5",
  "--color-border": "#d6d6d6",
  "--color-success": "#2e7d32",
  "--color-error": "#c62828",
  "--color-warning": "#8a5a00",
  "--space-base": "1rem",
};

/** common-web `assets/css/tokens.css` dark blocks. */
const LAYER_DARK_TOKENS: Record<string, string> = {
  "--color-primary": "#ff8a80",
  "--color-primary-hover": "#ffb4ab",
  "--color-on-primary": "#171717",
  "--color-text": "#e0e0e0",
  "--color-text-muted": "#b0b0b0",
  "--color-surface": "#1a1a2e",
  "--color-surface-raised": "#25253a",
  "--color-border": "#44445a",
  "--color-success": "#43a047",
  "--color-error": "#ef5350",
  "--color-warning": "#f0b429",
  "--space-base": "1rem",
};

const LAYER_LIGHT_EXPECTED: ExpectedColors = {
  text: "#171717",
  muted: "#5f6368",
  onPrimary: "#ffffff",
  surface: "#ffffff",
  primary: "#c62828",
  warning: "#8a5a00",
  danger: "#c62828",
  success: "#2e7d32",
};

const LAYER_DARK_EXPECTED: ExpectedColors = {
  text: "#e0e0e0",
  muted: "#b0b0b0",
  onPrimary: "#171717",
  surface: "#1a1a2e",
  primary: "#ff8a80",
  warning: "#f0b429",
  danger: "#ef5350",
  success: "#43a047",
};

const PARTIAL_LIGHT_MINIMUMS: Record<string, number> = {
  "muted-label": PARTIAL_LIGHT_MUTED_FLOOR,
  "preview-label": PARTIAL_LIGHT_MUTED_FLOOR,
};

export const HOST_MODES: HostMode[] = [
  {
    id: "partial-dark",
    url: `${FIXTURE_ORIGIN}/partial-dark.html`,
    colorScheme: "dark",
    fixtureTokens: PARTIAL_DARK_TOKENS,
    expected: PARTIAL_DARK_EXPECTED,
  },
  {
    id: "partial-light",
    url: `${FIXTURE_ORIGIN}/partial-light.html`,
    colorScheme: "light",
    fixtureTokens: PARTIAL_LIGHT_TOKENS,
    expected: PARTIAL_LIGHT_EXPECTED,
    minimums: PARTIAL_LIGHT_MINIMUMS,
  },
  {
    id: "tokenless-dark",
    url: `${FIXTURE_ORIGIN}/tokenless-dark.html`,
    colorScheme: "dark",
    fixtureTokens: {},
    expected: TOKENLESS_DARK_EXPECTED,
  },
  {
    id: "tokenless-light",
    url: `${FIXTURE_ORIGIN}/tokenless-light.html`,
    colorScheme: "light",
    fixtureTokens: {},
    expected: TOKENLESS_LIGHT_EXPECTED,
  },
  {
    id: "layer-light",
    url: `${LAYER_ORIGIN}/theme-harness`,
    colorScheme: "light",
    layerTheme: "light",
    fixtureTokens: LAYER_LIGHT_TOKENS,
    expected: LAYER_LIGHT_EXPECTED,
  },
  {
    id: "layer-dark",
    url: `${LAYER_ORIGIN}/theme-harness`,
    colorScheme: "dark",
    layerTheme: "dark",
    fixtureTokens: LAYER_DARK_TOKENS,
    expected: LAYER_DARK_EXPECTED,
  },
];

export { FIXTURE_ORIGIN, LAYER_ORIGIN };
