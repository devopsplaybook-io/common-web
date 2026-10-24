# Contributing

## Local checks

Use Node.js 22 and run the repository checks before opening a pull request:

```sh
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

The tests consume the generated npm tarball, not only the working tree.
`npm run build` checks the publish file list and builds the Nuxt playground.

Two quality gates run with `npm test`:

- **Coverage thresholds** are enforced in `vitest.config.ts` (statements 95%,
  branches 88%, functions 99%, lines 97%) over the composables, services and
  stores shipped in the tarball. Raise the bar when coverage improves; lower it
  only with an explanation in the PR.
- **Accessibility**: `tests/accessibility.spec.ts` runs axe-core against every
  shipped component mounted in a real DOM tree and fails on violations. The
  `color-contrast` rule is disabled there because jsdom cannot compute rendered
  contrast; WCAG AA color pairs are already gated by `tests/contrast.spec.ts`
  against the packed tokens.

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

Accepted development-only advisories (2026-10-24, after the Nuxt 4.6.2 /
Vitest 5.0.5 refresh):

| Advisory | Package | Severity | Path | Status |
| --- | --- | --- | --- | --- |
| GHSA-86w9-cpqp-85rv | node-forge 1.4.0 | high | nuxt → @nuxt/nitro-server → nitropack → listhen → node-forge | No fixed release (1.4.0 is latest); npm's only suggested fix is downgrading Nuxt to 4.1.3, rejected |

`npm audit` lists this single advisory as seven high entries because it is also
aggregated through `@nuxt/nitro-server`, `@nuxt/vite-builder`,
`@nuxt/vite-server`, `nitropack`, `listhen`, and `nuxt`.

Do not silence advisories with `npm audit fix --force`, npm `overrides`, or a
Nuxt downgrade. Re-run both audits after every dependency update and update this
table when the tree changes (remove the exception once `node-forge` ships a fix).

`PR Check` and `Main Build` run repository-local copies of the shared
`common-utils` npm workflows because the shared versions still gate on a full
`npm audit`. Restore the shared workflow calls once
`devopsplaybook-io/common-utils` adopts the production-only gate (its
`reusable-npm-audit.yml` already implements it for other workflow families).
