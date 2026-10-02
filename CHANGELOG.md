# Changelog

All notable changes to this project are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-10-02

### Added

- Emit `EventTypes.AUTH_UPDATED` from `AuthService.saveToken()` and
  `removeToken()` (including automatic session renewals); the Pinia
  authentication store now reacts to the event and refreshes
  `isAuthenticated`.
- Auto-registered client Nuxt plugin registering axios interceptors: requests
  without an explicit `Authorization` header receive the stored bearer token,
  and 401 responses clear the stale token.
- `Config.set()` and `Config.reset()` to inject or restore the shared
  configuration (`SERVER_URL`) from consuming applications.
- Optional `stack` field on `AlertMessage` payloads emitted by `handleError`.

### Fixed

- `useTheme().isDark` now reflects the effective theme: with the `system`
  preference it follows `prefers-color-scheme` and reacts to media-query
  changes.
- `UserService.isInitialized()` resolves to `false` on request failures
  instead of throwing.
- `handleError` keeps the error type in the alert text (`Name: message`) and
  preserves the stack trace for `Error` instances; HTTP-style
  `response.data.error` payloads keep their exact previous text.
- `RefreshIntervalService.set()` rejects invalid values (throws `TypeError`);
  `"0"` and other non-negative integer strings remain valid.
- `AppNavigation` renders `NuxtLink` instead of plain anchors, avoiding full
  page reloads.
- Deduplicated the dark-theme tokens using `light-dark()` while keeping both
  the explicit `data-theme="dark"` and the `prefers-color-scheme` activation
  paths.

### Changed

- Vitest runs with the `vmThreads` pool for faster jsdom test startup.

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
