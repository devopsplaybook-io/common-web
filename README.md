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
  operating-system preference.
- `useAppHeight()` updates `--app-height` from `visualViewport` when available
  and cleans up resize listeners on unmount.
- `useOfflineStatus()` returns a reactive `isOnline` ref.
- Services are browser-only and available through package deep imports, for
  example `@devopsplaybook.io/common-web/services/AuthService`. `AuthService`
  guards every `localStorage` access, so during SSR `getToken()` resolves
  `null` and `saveToken()` / `removeToken()` are no-ops.
- `createAuthenticationStore()` returns the Pinia store definition; `Pinia`
  must be available in the consuming app.

The canonical auth storage key is `auth_token`. During this compatibility
release, `AUTH_TOKEN` and `AUTH_TOKEN_KEY` are read and migrated to the
canonical key. Tokens remain in `localStorage`, matching existing applications.
When an authenticated token has entered the final 20% of its lifetime,
`AuthService` renews it through `POST /api/users/session/refresh` before
returning it from `getToken()` or `getAuthHeader()`. This extends active
sessions without requiring users to sign in again.

`getToken()` never rejects because of the stored or renewed token:

- A corrupt or undecodable token is treated as signed out: every auth key is
  removed, `AUTH_UPDATED` is emitted and `null` is returned. Expired tokens are
  removed and return `null`.
- A `401` or `403` from the refresh endpoint means the session was revoked:
  the session is cleared, `AUTH_UPDATED` is emitted and `null` is returned.
- Timeouts and invalid renewal responses perform a single request. Network
  errors and `5xx` responses retry once after a 500 ms backoff.
- When renewal still fails, the still-valid current token is returned and
  further renewal attempts for that token are paused for 30 seconds, so a slow
  or failing refresh endpoint is not retried on every authenticated call. The
  worst case is about 20.5 seconds per call for network/`5xx` failures and
  about 10 seconds for timeouts or invalid responses.
- Renewal requests time out after 10 seconds and concurrent calls share a
  single request. A token saved while a renewal is in flight wins over the
  renewed value.
- Renewed tokens are validated (decodable, non-empty, future `exp`, and
  `exp > iat` when `iat` is present) before they are persisted.

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

`PR Check` and `Main Build` run repository-local versions of the shared npm
workflows so the audit gate can cover production dependencies only;
development-toolchain advisories are reported but do not fail the build. See
[CONTRIBUTING.md](CONTRIBUTING.md#dependency-audit-policy) for the policy and
the accepted development-only advisories. The local jobs are a stop-gap until
the shared `common-utils` npm workflows adopt the same gate; the `PR Check`
bootstrap job is retained for the case where `main` has no package manifest.

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
