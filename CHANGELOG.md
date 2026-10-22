# Changelog

All notable changes to this project are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-10-22

### Changed

- Refresh the development toolchain: Nuxt 4.5.2 to 4.6.2, Pinia 4.0.3 to
  4.1.0, Vitest and `@vitest/coverage-v8` 5.0.2 to 5.0.5,
  `@vitejs/plugin-vue` 6.0.9 to 6.0.10, jsdom 30.1.1 to 30.1.3 and oxlint
  1.85.0 to 1.89.0.
- No published runtime dependency moved (`axios`, `jwt-decode`, `mitt` stay
  unchanged) and the Nuxt and Pinia peer ranges are unchanged, so consuming
  applications need no migration.

### Notes

- Nuxt 4.6 requires Node.js ^22.22.3, ^24.15.0 or >=26.0.0 for this layer's
  own playground build and tests.

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
