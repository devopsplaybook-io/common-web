# Changelog

All notable changes to this project are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.16.3] - 2026-11-27

### Fixed

- `AlertMessages` and `OfflineBanner` follow the application light/dark theme
  in hosts that import the components without the layer's
  `assets/css/tokens.css`. Their status colours (`--color-success`,
  `--color-warning`, `--color-error` and the matching `--color-on-*` labels) are
  mapped onto internal `--alert-message-*` / `--offline-banner-*` variables with
  `light-dark()` fallbacks mirroring the layer's dark palette, matching the
  login-with-code components and `AppUpdateNotice`. A token-less host must
  declare `color-scheme` for the fallbacks to follow the theme.

## [0.16.2] - 2026-11-27

### Fixed

- `AppUpdateNotice` follows the application light/dark theme in hosts that
  import the component without the layer's `assets/css/tokens.css`. Its five
  colour tokens (`--color-text`, `--color-surface-raised`, `--color-border`,
  `--color-primary` and `--color-on-primary`) are now mapped onto internal
  `--app-update-notice-*` variables with `light-dark()` fallbacks, matching the
  login-with-code components. As with those components, a token-less host must
  declare `color-scheme` for the fallbacks to follow the theme.

## [0.16.1] - 2026-11-26

### Changed

- Dependency refresh: Nuxt 4.7.0, Vite 8.4.0, oxlint 1.95.0, Vitest and
  `@vitest/coverage-v8` 5.1.2, `@types/node` 26.6.11 and postcss 8.5.33.
  `typescript` stays on 6.0.3: 7.0.2 drops the `typescript/lib/tsc` entry
  point that `vue-tsc` resolves, so `npm run typecheck` cannot run on it
  until a `vue-tsc` release supports the TypeScript 7 compiler package.
- Continuous integration: the Playwright browser cache moves to
  `actions/cache@v6` and the failure report to `actions/upload-artifact@v7`
  (Node 24 runtime and ESM releases; the inputs used — `path`, `key`, `name`,
  `if-no-files-found`, `retention-days` — are unchanged). No public API
  change.

## [0.16.0] - 2026-11-25

### Added

- A shared, opt-in PWA app-update toolkit. Detection and prompting are shared;
  each application keeps its own service worker and caching strategy, and the
  toolkit never assumes a particular caching implementation.
  - `BuildVersionProbe`: dependency-free `parseBuildManifest` / `parseShellBuildId`
    parsers and `createBuildVersionProbe()`, which reads
    `/_nuxt/builds/latest.json` (`cache: "no-store"`, abort timeout) and falls
    back to `/index.html` only when the manifest is unavailable.
  - `AppUpdateService`: framework-agnostic scheduler with a single in-flight
    request, a hidden-tab pause, a 5 minute default interval, per-build dismissal
    and an availability callback.
  - `useAppUpdate()`: SSR-safe Vue wrapper that checks on load, tab-visible,
    `online` and `focus`, pauses while hidden, and reloads exactly once after
    awaiting a `beforeReload` hook (throwing from it vetoes the reload).
  - `AppUpdateNotice`: presentational prompt driven only by props/events, so it
    also works with `@vite-pwa/nuxt`'s `$pwa.needRefresh`. Keeps a polite
    `role="status"` live region mounted at all times, is keyboard operable, uses
    token CSS variables with fallbacks, and exposes stable `data-testid`s.
  - `acceptServiceWorkerUpdate()`: posts `SKIP_WAITING`, waits for
    `controllerchange`, then reloads exactly once, with a timeout fallback.
- `docs/pwa-playbook.md`: the portfolio standard — caching matrix, service-worker
  strategy selection, update lifecycle, user-work protection, three copy-paste
  integration recipes and testing guidance.
- README "App update notice" section and the new toolkit plus Vitest, SSR and
  accessibility coverage.

### Changed

- The published file set now includes `docs/`.
- No runtime dependency was added and no existing public API changed.

## [0.15.0] - 2026-11-25

### Added

- A real-browser theme-contrast harness (`npm run test:e2e`, Playwright +
  Chromium, specs in `e2e/`) that renders `LoginWithCodeCard`,
  `AuthorizeDeviceCard` and `LoginCodeInput` in six host modes — the Nuxt layer
  in light and dark, a plain Vite host with Planner's partial dark and light
  palettes, and token-less hosts in both schemes — then measures WCAG 2.2 AA
  contrast for code text, muted labels, primary and secondary button labels, the
  warning callout, error text and input text from real `getComputedStyle`
  values. It also pins the measured colours to the host tokens, proves the
  `partial-dark` code panel is a dark surface using host text (the reported
  regression), and snapshots every scenario and host mode.
- `tests/theme-host/`: a plain Vite + Vue fixture (no Nuxt, no common-web layer,
  no `tokens.css`) importing the components from the packed tarball with a
  no-network `LoginCodeService` stub, plus the `partial-dark`, `partial-light`,
  `tokenless-dark` and `tokenless-light` palette pages.
- `playground/pages/theme-harness.vue` (`/theme-harness`) with the same
  scenarios inside the layer, used for the layer light/dark runs.
- A blocking `theme-contrast` job in `PR Check` (after `test-and-build`) that
  installs Chromium, runs the harness and uploads the Playwright report on
  failure; `publish-beta` now waits for it.
- README section "Testing the theming contract" and a CONTRIBUTING entry for the
  new local check. Planner's light `--color-text-muted` (4.41:1 on white, 4.01:1
  on the derived raised panel) is documented as the one exempt pair with a 3.9
  floor; raising that token is a Planner change.

### Changed

- `@playwright/test` is a devDependency and `vite` is an explicit devDependency
  (it was already resolved through Nuxt) for the harness runner.
- Test and CI only: no component API, service, composable or shipped-style
  change, so the published file set and consumer behaviour are unchanged.

## [0.14.0] - 2026-11-25

### Added

- `LoginCodeService`, a client for the cross-device login-with-code protocol of
  `@devopsplaybook.io/common-utils` 2.12.0: typed `capabilities`, `create`,
  `poll`, `preview`, `approve` and `cancel` methods, an injectable HTTP client,
  `AbortSignal` support, a configurable base URL and a typed `LoginCodeError`
  with stable backend codes plus transport and parsing codes.
- `useLoginCode()`: the device-side state machine with server-clock countdowns,
  recursive polling with exponential backoff, pause/resume on visibility and
  focus, abortable requests, session capture and terminal states.
- `LoginCodeInput`, `LoginWithCodeCard` and `AuthorizeDeviceCard`: accessible
  code entry, the requesting-device flow (with a fresh request after expiry or
  cancellation) and the approver flow with an optional password step-up, all
  localisable through `labels` props.
- A playground page plus component, service, composable, SSR, accessibility and
  no-Nuxt-import tests.
- `--color-on-primary` in `assets/css/tokens.css` (`#ffffff` in the light theme,
  `#171717` in both dark blocks) for primary-button labels; `tests/contrast.spec.ts`
  gates it at AA against `--color-primary`.

### Changed

- The login-with-code components theme themselves from the host application's
  tokens through an internal `--lc-*` layer: host tokens win, token-less and
  partial palettes get theme-aware `light-dark()` fallbacks, and the raised
  surface is derived with `color-mix()` when `--color-surface-raised` is absent.
  This fixes the components rendering light-only panels, invisible code and
  white-on-light buttons in a dark non-layer host such as Planner.
- Warning and error states are callouts (accent border, text in the host text
  colour) instead of solid fills, so `--color-on-warning`/`--color-on-error` are
  no longer required by these components.
- Primary buttons use `--color-on-primary`; secondary buttons and the input use
  the host surface, border and text tokens; focus rings follow `--color-primary`.
- `LoginWithCodeCard` and `AuthorizeDeviceCard` accept `variant` (`card` |
  `plain`) and `headingLevel` (`2` | `3` | `4`) to embed in an existing card or
  section without duplicated chrome or headings.
- Spacing goes through `--lc-space`, bridging `--space-base` and `--space-md`.

The API stays additive: no existing export, prop or behaviour changed, and no
runtime dependency was added or upgraded (the service reuses the existing axios
dependency; `postcss` is a dev-only dependency of the theme-contract test).

## [0.13.0] - 2026-11-25

### Added

- `AuthService.startSessionRenewal()`: the standard client renewal loop. It
  checks the token immediately, on a visible `visibilitychange`, on `focus` and
  every five minutes, and renews when 20 % or less of the lifetime remains
  (the existing `getToken()` behaviour). It is opt-in, idempotent, SSR-safe and
  returns a stop function that clears the interval and listeners.
- `SESSION_RENEWAL_CHECK_INTERVAL_MS` (five minutes) and an optional
  `intervalMs` override.
- Tests for the start, visibility, focus, interval, stop, double-start,
  double-stop and SSR paths; README documentation of the client-plugin snippet.

## [0.12.0] - 2026-11-01

### Added

- Per-message **Dismiss** button on `AlertMessages`: a native, keyboard-operable
  `type="button"` with the accessible name `Dismiss`, so sticky alerts can be
  closed with the mouse or the keyboard.
- Optional `label` prop on `AppNavigation` (default `Main navigation`), so two
  navigations on one page are distinguishable to screen readers.
- `.page-layout` and `.page-alert-messages` class hooks in the app shell.

### Changed

- Dark mode defines `--color-primary` (`#ff8a80`) and `--color-primary-hover`
  (`#ffb4ab`), which meet WCAG AA on the shipped dark surfaces.
- The contrast gate covers text, muted text, primary and primary hover on both
  shipped surfaces in both themes, in addition to every status pair.
- `AlertMessages` clamps negative `durationMs` values to `0` and uses the
  five-second default for non-finite values.

### Fixed

- M5: sticky alerts are dismissible instead of being kept forever.
- L3: dark-mode primary and hover text reach WCAG AA.
- L5: navigation instances are distinguishable and duplicate link targets no
  longer break rendering.
- L6: error alerts are announced assertively in a sibling region and
  `durationMs` is validated.
- L7: app-shell hooks are documented classes, with the legacy IDs retained.

No dependency changed and no OpenTelemetry metric is added in this release.

## [0.11.0] - 2026-11-01

### Added

- Optional CSP nonce for the pre-paint theme script: set
  `COMMON_WEB_THEME_SCRIPT_NONCE` at build time, or build the head entry with
  the new `themeInitScriptEntry(nonce)` helper and override `app.head.script`
  in the consuming application for per-request nonces.
- Cross-tab theme synchronisation through the `storage` event.

### Changed

- `useTheme()` state is a module-wide singleton: every call shares
  `preference` and `isDark`, so independent instances stay in sync. The public
  API is unchanged.
- `useOfflineStatus()` starts from `true` and reads `navigator.onLine` after
  mount, so a page loaded offline hydrates without a mismatch and shows the
  banner immediately afterwards.
- `PreferencesService` and `RefreshIntervalService` route storage through the
  shared guarded helper and are now safe during SSR and with blocked storage.

### Fixed

- M3: `useTheme()` no longer throws when `localStorage` is missing or blocked
  (sandboxed iframe, privacy mode); the theme still applies and persistence is
  skipped.
- M4: theme state is shared between `useTheme()` instances and across tabs.
- M8: `OfflineBanner` no longer produces a hydration mismatch on an offline
  page.
- L1: `PreferencesService` and `RefreshIntervalService` fall back instead of
  throwing without storage.
- L9: the injected theme script accepts a CSP nonce.
- L13: unmounting one `useAppHeight()` instance no longer cancels a pending
  frame scheduled by another; the shared frame is cancelled with the last
  instance.

No dependency changed and no OpenTelemetry metric is added in this release.

## [0.10.0] - 2026-11-01

### Added

- `registerAxiosAuthInterceptors(instance, { allowedOrigins, loginPaths })`:
  `allowedOrigins` lists extra origins that may receive the bearer token, and
  `loginPaths` replaces the default `/users/session` login-path exemption.
- `AUTH_RENEWAL_FAILED` event with `{ reason }` (`timeout`, `5xx`, `network` or
  `invalid-response`), carrying no token or PII. No OpenTelemetry metric or
  dependency is added.
- `UserService.isInitialized({ timeoutMs, signal, cacheTtlMs })`: a 5 s default
  timeout, an optional `AbortSignal`, an opt-in short-lived cache for a
  successful result and a logged failure reason.
- `handleError(error, { debug })`: `debug: true` logs the raw error object; the
  default logs a sanitized summary with redacted credentials.
- `removeToken(token)` compare-and-remove semantics.

### Changed

- Bearer-token attachment is origin-scoped: relative URLs, the page origin, the
  origin of an absolute `SERVER_URL` and configured `allowedOrigins` receive
  the token; every other origin receives none and cannot trigger renewal.
- A `401` clears the session only when the failed request used the currently
  stored token; a stale `401` is ignored.
- Session renewal runs in the background: `getToken()` and `getAuthHeader()`
  return the still-valid token immediately while renewal continues. The
  renewal timeout drops from 10 s to 3 s; one 500 ms retry and the 30 s cooldown
  are unchanged.
- `Config.set()` trims whitespace and strips trailing slashes and warns in
  development about insecure non-loopback `http:` URLs.
- `removeToken()`'s optional argument is no longer ignored, and
  `AuthenticationStore` unsubscribes its `AUTH_UPDATED` listener when disposed.

### Fixed

- H1: bearer tokens are no longer attached to requests to third-party origins.
- M1: a stale `401` no longer clears a newer session.
- M2: error logging no longer includes the bearer token.
- M6: `UserService.isInitialized()` no longer stalls on a hung backend and
  reports the failure reason.
- M10: session renewal no longer blocks the triggering request.
- L2: an expired token is never returned after a slow renewal failure.
- L4: the authentication store no longer leaks an event listener per instance.
- L10: `SERVER_URL` trailing-slash and insecure-HTTP handling is enforced.
- L11: login-path detection is configurable.
- L14: tokens with malformed `exp`/`iat` claims are treated as corrupt.

No dependency changed in this release.

## [0.9.0] - 2026-11-01

### Added

- Type-check gate: `npm run typecheck` runs `nuxi typecheck` (`vue-tsc --noEmit`)
  over the layer, playground and tests. TypeScript 6.0.3, vue-tsc 3.3.14 and
  Node 22 types are pinned in `devDependencies`; both CI workflows run the gate.
- Node-environment SSR smoke test (`tests/ssr.spec.ts`) rendering the shipped
  components with `createSSRApp` and `renderToString` as part of `npm test`.

### Changed

- Production dependency audit is clean again: `follow-redirects` is pinned to
  1.16.2 through the lockfile (GHSA-mrwp-f3q8-3g9p). The full dev-only audit
  and its accepted advisories are documented in `CONTRIBUTING.md`.
- Packaging metadata: `vue` is now an explicit peer dependency and `pinia` is
  optional through `peerDependenciesMeta` (still a devDependency for tests).
- `pretest` and `prebuild` run `nuxi prepare` so the generated Nuxt tsconfig
  that the root `tsconfig.json` extends exists before the test and playground
  build steps, which also runs in CI after a clean install.
- The type-check gate required mechanical type annotations in
  `tests/contrast.spec.ts`; no runtime behaviour or public API changed.

### Fixed

- `npm audit --omit=dev --audit-level=high` no longer fails on `main`.

## [0.8.1] - 2026-10-29

### Changed

- Dependency refresh: Axios 1.21.0, Pinia 4.1.0, Nuxt 4.6.3, oxlint 1.90.0,
  `@vitejs/plugin-vue` 6.0.10 and jsdom 30.1.3. No public API change.

## [0.8.0] - 2026-10-24

### Added

- Package metadata: `repository`, `homepage`, `bugs` and a conservative
  `sideEffects` whitelist (CSS and `.vue` files are never tree-shaken;
  the `.ts` modules are side-effect-free at import time). No `types` entry is
  added because the package intentionally ships raw sources with no build step;
  this is now documented in the README.
- axe-core accessibility gate: `tests/accessibility.spec.ts` mounts every
  shipped component in a real DOM tree and fails on axe violations
  (`color-contrast` is covered by the packed-tokens contrast test instead,
  because jsdom cannot compute rendered contrast).
- Coverage thresholds in `vitest.config.ts` (statements 95%, branches 88%,
  functions 99%, lines 97%) so coverage regressions fail `npm test`.

### Changed

- `scripts/build-package.mjs` now derives `requiredFiles` from the public
  source directories plus the fixed root assets, so every public file is
  required and packaging regressions fail `npm run build` instead of shipping
  silently.
- Removed the dead `base-package` and `bootstrap-checks` jobs from `PR Check`;
  `main` has had a package manifest since 0.4.0, so the bootstrap path could
  never run. `version-check` now always runs.
- README: removed the stale bootstrap-workflow note and added "SSR and
  client-only usage" plus "Packaging, types and side effects" documenting the
  delivered behavior. CONTRIBUTING: documented the coverage and accessibility
  gates.
- `.gitignore` now excludes environment files (`.env`, `.env.*` with an
  `!.env.example` exception) and key material (`*.pem`, `*.key`). No secret is
  committed today; this is cheap hardening. No consumer-facing API change.

## [0.7.0] - 2026-10-24

### Added

- Pre-paint theme script: the layer injects a small inline `<head>` script that
  applies `data-theme` from `localStorage` and `prefers-color-scheme` before
  first paint, removing the flash of the light theme for users with a stored
  dark preference. Applications with a strict CSP must allow this inline script
  (nonce or `unsafe-inline`); without it the existing `prefers-color-scheme`
  CSS path still applies.
- Per-status foreground tokens `--color-on-success`, `--color-on-error` and
  `--color-on-warning` so status backgrounds and their text meet WCAG AA in
  both themes, with an automated contrast test over the shipped tokens.
- `AppNavigation` accepts a `linkComponent` prop (default `"a"`) so Nuxt apps
  can opt into SPA navigation with `resolveComponent("NuxtLink")` instead of
  full page reloads.
- `OfflineBanner` accepts a `message` prop (default `"You are offline."`) and
  keeps its `role="status"` live region mounted at all times, so the offline
  announcement is not missed by screen readers; while online the region is
  visually hidden.
- `AlertMessages` supports sticky alerts with `durationMs: 0`, deduplicates
  identical `type` + `text` pairs, and caps the queue at five messages (oldest
  dropped first).
- Respect `prefers-reduced-motion`: the loading spinner, `dpb-fade-in` and
  `dpb-blink` animations are disabled under reduced motion.

### Changed

- `useTheme().isDark` is now the effective theme: under the default `system`
  preference it follows `prefers-color-scheme` (including live media changes),
  and `toggleTheme()` toggles from the effective value instead of only an
  explicit `dark` preference.
- Alert styles are prefixed: `.message*` selectors are renamed to
  `.alert-message*` (`.alert-message`, `.alert-message-text`,
  `.alert-message-{type}`) so they no longer collide with consumer styles.
  This is the only consumer-facing class change.
- `useAppHeight()` coalesces resize updates with `requestAnimationFrame`, so
  repeated resize events and multiple component instances write the CSS custom
  property at most once per frame.
- `useOfflineStatus()` initialises `isOnline` from `navigator.onLine`, so a
  page loaded offline no longer briefly renders as online.
- `AlertMessage.type` is narrowed to `"info" | "success" | "warning" | "error"`
  instead of collapsing to `string`, and the mitt compatibility index
  signatures are documented.
- `AuthService.removeToken()` documents that its optional argument is accepted
  for API compatibility and ignored.

### Fixed

- Dark-mode status colors failed WCAG AA against white text (warning 1.86:1,
  success/info 3.30:1, error 4.23:1). Dark backgrounds now use `#171717` text
  through the new `--color-on-*` tokens, and dark `--color-error` changed from
  `#e53935` to `#ef5350` because the old value cannot reach 4.5:1 with either
  white or `#171717` text. Light mode is unchanged and passes.
- The playground theme button showed "Switch to dark" on an already-dark page
  under the `system` preference; `toggleTheme()` now toggles correctly.
- The offline banner no longer claims "showing cached data"; the layer provides
  no cache and the default copy is now neutral.

## [0.6.0] - 2026-10-24

### Added

- Propagate auth state changes: `AuthService` emits `AUTH_UPDATED` when a token
  is saved, removed, renewed or expires; the authentication store subscribes and
  refreshes `isAuthenticated`, and cross-tab token changes are synchronised
  through the `storage` event. The additive `refreshAuthentication()` store
  action is available for manual refreshes.
- Opt-in Axios integration through `registerAxiosAuthInterceptors(instance)`:
  attaches the stored bearer token only when no `Authorization` header is set,
  clears the session on `401` except for the login endpoint (`/users/session`),
  and registers once per Axios instance. No layer plugin is auto-registered, so
  existing applications keep their current behaviour until they opt in.
- `Config.set()` and `Config.reset()` inject or clear the `SERVER_URL` override
  (`/api` by default).
- Document the new event, the opt-in Axios helper and the configuration
  injection point, including the HTTPS requirement for non-same-origin servers.

### Changed

- `UserService.isInitialized()` resolves `false` on network and HTTP failures
  instead of rejecting.
- `RefreshIntervalService.get()` validates the stored value and falls back to
  `10000`; `set()` normalises valid values and throws `TypeError` for invalid
  ones. `"0"` remains valid to disable polling.

## [0.5.0] - 2026-10-24

### Fixed

- Treat corrupt or undecodable stored JWTs as signed out: clear every auth key,
  emit `AUTH_UPDATED`, and return `null` instead of throwing.
- Bound session renewal: 10 s request timeout, at most one retry after a 500 ms
  backoff for network/5xx failures, and a 30 s per-token failure cooldown so a
  failing refresh endpoint is not retried on every authenticated call.
- Clear the session and emit `AUTH_UPDATED` when session renewal returns
  401/403 (revoked session).
- Validate renewed JWTs (decodable, non-empty, future `exp`, `exp > iat`) before
  persisting them; keep the newer token when it changes during renewal.
- Make `AuthService` storage access SSR-safe: no `localStorage` access outside
  the browser; `getToken()` returns `null` and save/remove are no-ops.
- Cover the failure paths of session renewal and token handling with tests.

## [0.4.0] - 2026-10-24

### Changed

- Refresh the development toolchain: Nuxt `^4.6.2`, Vitest and
  `@vitest/coverage-v8` `^5.0.5`, and a regenerated lockfile. The production
  dependency audit now reports no vulnerabilities.
- Run `PR Check` and `Main Build` as repository-local equivalents of the shared
  `common-utils` npm workflows: the blocking gate covers runtime dependencies
  only (`npm audit --omit=dev --audit-level=high`) and the full audit is
  reported without failing the build.
- Document the dependency audit policy and the accepted development-only
  advisories in `CONTRIBUTING.md`.

## [0.3.0] - 2026-09-28

### Added

- Automatically renew authenticated sessions before their JWT expires.

## [0.2.1] - 2026-09-28

### Fixed

- Add string and symbol index signatures to the event map for compatibility
  with mitt's typed emitter constraint.

## [0.2.0] - 2026-09-28

### Changed

- Upgrade Axios to 1.20.0 and Pinia to 4.0.3.
- Support Pinia 4 consumers while retaining Pinia 2 and 3 compatibility.

## [0.1.0] - 2026-09-27

### Added

- Initial Nuxt 4 layer package with shared design tokens and app-shell styles.
- Loading, alert, navigation, and offline-banner components.
- Theme, app-height, and offline-status composables.
- Shared browser services for authentication, configuration, preferences,
  refresh intervals, user initialization, and timeouts.
- Vitest coverage against the packed package and a Nuxt playground.
