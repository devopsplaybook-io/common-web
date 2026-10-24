# Changelog

All notable changes to this project are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
