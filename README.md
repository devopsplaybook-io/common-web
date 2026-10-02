# @devopsplaybook.io/common-web

A small, no-build Nuxt 4 layer containing shared design tokens, UI components,
composables, and browser services for DevOpsPlaybook web applications.

## Quick start

```sh
npm install @devopsplaybook.io/common-web
```

Extend the layer from your Nuxt configuration:

```ts
export default defineNuxtConfig({
  extends: ["@devopsplaybook.io/common-web"],
});
```

Layer components and composables are auto-imported by Nuxt. The package ships
raw Vue and TypeScript sources; your app's Nuxt build compiles them. Nuxt 4 is
required. The `playground/` directory demonstrates a consuming app.

## Components

| Component | Purpose |
| --- | --- |
| `<Loading size="small" />` | Accessible loading indicator; `size` is `small` or `large`. |
| `<AlertMessages />` | Accessible live region displaying messages emitted on `EventBus`. |
| `<AppNavigation :links="links" />` | Navigation shell with a named `brand` slot and configurable links (`label`, `to`, optional `icon` and `active`). |
| `<OfflineBanner />` | Announces offline status and accepts replacement content through its default slot. |

`AlertMessages` listens for `EventTypes.ALERT_MESSAGE` events. Its payload is
`{ text, type?, durationMs? }`; the default display duration is five seconds.
`handleError(error)` logs the error and emits a corresponding error alert.

## Composables and services

- `useTheme()` persists `light`/`dark` preferences in `localStorage` and applies
  `data-theme` to the document root. Use `setTheme("system")` to return to the
  operating-system preference. The returned `isDark` reflects the effective
  theme, including `prefers-color-scheme` while the preference is `system`,
  and follows media-query changes.
- `useAppHeight()` updates `--app-height` from `visualViewport` when available
  and cleans up resize listeners on unmount.
- `useOfflineStatus()` returns a reactive `isOnline` ref.
- Browser services are available through package deep imports, for example
  `@devopsplaybook.io/common-web/services/AuthService`.
- `createAuthenticationStore()` returns the Pinia store definition; `Pinia`
  must be available in the consuming app.

The canonical auth storage key is `auth_token`. During this compatibility
release, `AUTH_TOKEN` and `AUTH_TOKEN_KEY` are read and migrated to the
canonical key. Tokens remain in `localStorage`, matching existing applications.
When an authenticated token has entered the final 20% of its lifetime,
`AuthService` renews it through `POST /api/users/session/refresh` before
returning it from `getToken()` or `getAuthHeader()`. This extends active
sessions without requiring users to sign in again.

`AuthService.saveToken()` and `removeToken()` emit `EventTypes.AUTH_UPDATED`
on `EventBus`, including when a session renewal stores a renewed token. The
Pinia authentication store subscribes to the event and refreshes its
`isAuthenticated` state.

A client-side Nuxt plugin (`plugins/common-web-axios.client.ts`) registers
axios interceptors automatically: requests without an explicit `Authorization`
header receive the stored bearer token, and 401 responses clear the stale
token. Explicit-header flows (for example `getAuthHeader()`) are left
untouched, and the interceptors register only once per axios instance.

`Config.get()` stays asynchronous and returns `{ SERVER_URL: "/api" }` by
default. Applications can inject a different base URL with
`Config.set({ SERVER_URL: "https://api.example.com" })` and restore the
defaults with `Config.reset()`.

Additional behaviors to be aware of when adopting this release:

- `UserService.isInitialized()` resolves to `false` when the initialization
  endpoint cannot be reached (previously it rejected).
- `RefreshIntervalService.set()` throws a `TypeError` for values that are not
  non-negative integer strings; `"0"` remains valid.
- `handleError` alerts keep the `response.data.error` string when present and
  otherwise include the error type (`"Name: message"` for `Error` instances);
  the optional `stack` field of the alert payload carries the stack trace.

## Tokens and app-shell styles

The layer loads `assets/css/tokens.css` and `assets/css/app-shell.css`.
Tokens include `--color-*`, `--space-*`, `--text-*`, `--radius-*`,
`--shadow-*`, `--header-height`, and `--app-height`. Dark mode can be selected
with `data-theme="dark"` or comes from `prefers-color-scheme` when no explicit
light preference is set.

Load app-specific CSS after the layer and redefine only the values you need:

```css
:root {
  --color-primary: #145da0;
  --header-height: 4.5rem;
}
```

## Overriding a component

Nuxt gives app-local components priority over layer components. Add a component
with the same name under your app's `components/` directory, for example
`components/Loading.vue`, and it replaces the layer's `<Loading />` without
forking or modifying this package. App-specific navigation items are passed
through the `links` prop rather than embedded in the layer.

Deep imports are also available for tooling and tests that do not run inside a
Nuxt app:

```ts
import Loading from "@devopsplaybook.io/common-web/components/Loading.vue";
```

## Compatibility and release policy

This release supports Nuxt `^4.0.0` and Pinia
`^2.0.0 || ^3.0.0 || ^4.0.0`. Pinia 4 is ESM-only and requires the consuming
application to install its `@vue/devtools-api` peer dependency. Nuxt 3
applications (including Telepathy) are not supported.

For a Nuxt major upgrade, update the peer dependency, build the playground with
the new major, test all exported components/composables from the packed
tarball, and verify a scratch consumer can extend the layer before releasing.
Keep releases semantic: patch for fixes, minor for backwards-compatible
features, and major for breaking API or framework changes. The merge workflow
publishes a new public npm version when the package version is not already
published; bump `package.json` manually on the release PR.

The initial bootstrap PR uses a repository-local workflow that runs install,
audit, lint, packed-package tests, and the playground build. This is necessary
because the shared PR workflow compares against `origin/main:package.json`,
which does not exist before this first package change. Once the manifest is on
`main`, PRs use the shared npm PR workflow; main builds always use the shared
publish workflow.

## Development

```sh
npm ci
npm run lint
npm test
npm run build
npm run dev
```

`npm test` packs the library and runs component and service tests against that
archive. `npm run build` validates its contents and builds the playground.
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and release details.
