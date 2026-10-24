# Changelog

All notable changes to this project are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
