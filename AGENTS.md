# Agent guidance

- Keep changes in this repository; application adoption is tracked separately.
- Preserve the no-build Nuxt layer distribution and the explicit Vue imports
  needed to test raw source files outside Nuxt.
- Resolve layer CSS relative to `import.meta.url`; `~/` paths resolve against a
  consuming app and are incorrect here.
- Run `npm run lint`, `npm test`, and `npm run build`.
- Keep the package file allowlist intentional. Do not publish tests, playground
  sources, workflow files, or build output.
- Bump `package.json` manually for releases and update `CHANGELOG.md`.
