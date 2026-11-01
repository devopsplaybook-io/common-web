# Contributing

## Local checks

Use Node.js 22 and run the repository checks before opening a pull request:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

The tests consume the generated npm tarball, not only the working tree.
`npm run build` checks the publish file list and builds the Nuxt playground.

`npm run typecheck` runs `nuxi typecheck` (`vue-tsc --noEmit`) over the shipped
sources, the playground and the tests, and fails on any type error. `PR Check`
and `Main Build` run it right after linting. The package ships raw TypeScript
and Vue sources, so this gate catches type regressions that would otherwise
surface only in a consuming application's build.

Three quality gates run with `npm test`:

- **Coverage thresholds** are enforced in `vitest.config.ts` (statements 95%,
  branches 88%, functions 99%, lines 97%) over the composables, services and
  stores shipped in the tarball. Raise the bar when coverage improves; lower it
  only with an explanation in the PR.
- **Accessibility**: `tests/accessibility.spec.ts` runs axe-core against every
  shipped component mounted in a real DOM tree and fails on violations. The
  `color-contrast` rule is disabled there because jsdom cannot compute rendered
  contrast; WCAG AA color pairs are already gated by `tests/contrast.spec.ts`
  against the packed tokens.
- **SSR**: `tests/ssr.spec.ts` renders the shipped components in a Node
  environment with `createSSRApp` and `renderToString`, so the SSR
  compatibility promised by the README is exercised on every test run.

## Scope and compatibility

Keep the layer limited to UI and browser behavior that is shared by multiple
applications. Do not move app-domain components into this package. Components
must retain their accessibility semantics, and Vue APIs used by raw library
sources must be explicitly imported.

The supported framework peer dependency is Nuxt 4. A Nuxt major upgrade needs
a playground build and packed-tarball validation before the peer range changes.

## Pull requests and releases

Use conventional commit titles and include a summary and test plan in the PR.
Keep releases semantic and update `package.json` and `CHANGELOG.md` together.
The `Main Build` workflow publishes a version to public npm only when that
version does not already exist. Do not publish manually from a developer
machine.

`PR Check` and `Main Build` use repository-local copies of the shared
`common-utils` npm workflows until the shared versions adopt the
production-only audit gate. See [Dependency audit
policy](#dependency-audit-policy).

## Dependency audit policy

CI gates only the dependencies that ship to applications:

- **Blocking**: `npm audit --omit=dev --audit-level=high` must report zero
  vulnerabilities. Runtime dependencies such as `axios` are covered by this gate.
- **Non-blocking**: the full `npm audit` (devDependencies included) also runs in
  the same job with `continue-on-error: true`. Its findings are reported in the
  workflow log and in this document; they do not fail the build.

This package is a no-build Nuxt layer: consumers receive raw sources and install
their own Nuxt, so the Nuxt build/test toolchain in `devDependencies` is never
shipped or executed inside a consuming application. A vulnerability that exists
only in that toolchain is a build-environment risk, not a runtime risk for
consumers.

Accepted development-only advisories (2026-11-01, after the
`follow-redirects` lockfile fix and the type-check toolchain):

| Advisory | Package | Severity | Path | Status |
| --- | --- | --- | --- | --- |
| GHSA-gcqx-w48m-w2h4 | `deepmerge` 4.3.1 (affected 4.2.0–4.3.1) | low | nuxt → @nuxt/nitro-server → nitropack → @rollup/plugin-node-resolve → deepmerge | No compatible release; npm's only suggested fix is downgrading Nuxt to 4.1.3, rejected |
| GHSA-3g3m-2fjr-6pw4 | `glob` (affected 9.0.0–14.0.1) | moderate | Nuxt toolchain (@nuxt/nitro-server, nitropack, @vercel/nft, archiver, archiver-utils, zip-stream) and @vue/test-utils → js-beautify | npm's fix is downgrading @vue/test-utils to 2.4.11 or Nuxt to 4.1.3, rejected |
| GHSA-g3hv-75wg-m249 | `minimatch` (affected <11.0.1) | moderate | @vue/test-utils → js-beautify → editorconfig → minimatch; also readdir-glob and archiver-utils | Same downgrade suggested, rejected |

`npm audit` reports these three advisories as 17 entries (2 low, 15 moderate)
because they are also aggregated through `@nuxt/nitro-server`,
`@nuxt/vite-builder`, `@nuxt/vite-server`, `nitropack`, `nuxt`,
`@vue/test-utils`, `archiver`, `archiver-utils`, `zip-stream`, `readdir-glob`,
`@vercel/nft`, `@rollup/plugin-node-resolve`, `glob`, `minimatch`,
`editorconfig`, `js-beautify` and `deepmerge`. Every entry is reachable only
through `devDependencies`.

Do not silence advisories with `npm audit fix --force`, npm `overrides`, or a
Nuxt or `@vue/test-utils` downgrade. Re-run both audits after every dependency
update and refresh this table when the tree changes; remove an entry once its
toolchain ships a compatible fix. The production audit (0 vulnerabilities at
this revision) is re-checked by `PR Check` and `Main Build` on every change.

`PR Check` and `Main Build` run repository-local copies of the shared
`common-utils` npm workflows because the shared versions still gate on a full
`npm audit`. Restore the shared workflow calls once
`devopsplaybook-io/common-utils` adopts the production-only gate (its
`reusable-npm-audit.yml` already implements it for other workflow families).
