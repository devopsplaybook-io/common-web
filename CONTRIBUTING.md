# Contributing

## Local checks

Use Node.js 22 and run the repository checks before opening a pull request:

```sh
npm ci
npm run lint
npm test
npm run build
```

The tests consume the generated npm tarball, not only the working tree.
`npm run build` checks the publish file list and builds the Nuxt playground.

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

The first package PR uses equivalent local checks because the shared PR
workflow expects `package.json` to exist on `main`; subsequent PRs use the
shared npm PR workflow.
