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
| `<Loading size="small" />` | Accessible loading indicator; `size` is `small` or `large`. The animation is disabled under `prefers-reduced-motion: reduce`. |
| `<AlertMessages />` | Accessible live region displaying messages emitted on `EventBus`. |
| `<AppNavigation :links="links" :link-component="NuxtLink" />` | Navigation shell with a named `brand` slot and configurable links (`label`, `to`, optional `icon` and `active`). |
| `<OfflineBanner message="You are offline." />` | Announces offline status and accepts replacement content through its default slot. |

`AlertMessages` listens for `EventTypes.ALERT_MESSAGE` events. Its payload is
`{ text, type?, durationMs? }` with `type` limited to `info`, `success`,
`warning` or `error`. The default display duration is five seconds;
`durationMs: 0` keeps the message until it is dismissed from the queue.
Identical `type` + `text` pairs are deduplicated and the queue keeps at most
five messages, dropping the oldest first. Alert styles use the prefixed
`.alert-message*` classes, so consumer stylesheets are not affected by the
layer's global styles. `handleError(error)` logs the error and emits a
corresponding error alert.

`AppNavigation` renders plain `<a href>` links by default, which keeps
non-Nuxt deep imports and raw-source usage working. Nuxt applications should
pass their link component to keep SPA state on navigation:

```vue
<script setup lang="ts">
import { resolveComponent } from "vue";

const NuxtLink = resolveComponent("NuxtLink");
</script>

<template>
  <AppNavigation :links="links" :link-component="NuxtLink" />
</template>
```

`OfflineBanner` keeps its `role="status"` live region mounted at all times so
screen readers announce the transition; while online the region is visually
hidden. The default copy is the neutral `You are offline.`; replace it with
the `message` prop or the default slot.

## Composables and services

- `useTheme()` persists `light`/`dark` preferences in `localStorage` and applies
  `data-theme` to the document root. `isDark` reflects the effective theme: the
  default `system` preference follows `prefers-color-scheme`, including live
  operating-system changes, and `toggleTheme()` toggles from that effective
  value. Use `setTheme("system")` to return to the operating-system preference.
  The layer also injects a small pre-paint `<head>` script that applies
  `data-theme` from `localStorage` and `prefers-color-scheme` before first
  paint, so a stored dark preference no longer flashes the light theme during
  load. Applications with a strict CSP must allow this inline script (nonce or
  `unsafe-inline`); without it, the `prefers-color-scheme` CSS path still
  applies and the theme resolves after hydration.
- `useAppHeight()` updates `--app-height` from `visualViewport` when available
  and cleans up resize listeners on unmount. Resize updates are coalesced with
  `requestAnimationFrame`, so repeated resize events and multiple component
  instances write the custom property at most once per frame.
- `useOfflineStatus()` returns a reactive `isOnline` ref, initialised from
  `navigator.onLine` so a page loaded offline renders offline immediately.
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

## Authentication state and HTTP integration

`AuthService.saveToken()` and `removeToken()` emit
`EventTypes.AUTH_UPDATED` on the `EventBus` when the stored token actually
changes; renewal and expiry go through those methods. The Pinia store subscribes
to the event and refreshes `isAuthenticated`, so a renewal, a logout in another
tab or an expired token no longer leaves the UI stale. Call the additive
`refreshAuthentication()` action for a manual refresh; `ensureAuthenticated()`
still loads the initial state. The store also listens for the browser `storage`
event, which synchronises token changes across tabs.

Bearer-token attachment is opt-in: the layer ships only the registration helper
and does not register a plugin, so existing applications keep their current
behaviour. Add a client plugin in the consuming application when the default
Axios instance should authenticate requests and clear the session on `401`:

```ts
// plugins/auth.client.ts
import { registerAxiosAuthInterceptors } from "@devopsplaybook.io/common-web/services/AxiosAuthInterceptor";

export default defineNuxtPlugin(() => {
  registerAxiosAuthInterceptors();
});
```

`registerAxiosAuthInterceptors(instance?)` attaches `Authorization: Bearer
<token>` only when the request has no explicit `Authorization` header, and is
idempotent per Axios instance (it returns `false` when already registered). It
preserves an explicit header without renewing the token, and does not clear the
session on a failed login to a path ending in `/users/session`; a `401` from
any other endpoint (including `/users/session/refresh`) removes the stored token
and emits `AUTH_UPDATED`.

### Server URL configuration

`Config.get()` returns `{ SERVER_URL: "/api" }` by default. Inject a different
base URL, for example from a Nuxt client plugin, and reset it for tests:

```ts
import Config from "@devopsplaybook.io/common-web/services/Config";

Config.set({ SERVER_URL: "https://api.example.com" });
await Config.get(); // { SERVER_URL: "https://api.example.com" }
Config.reset(); // back to "/api"
```

A non-same-origin `SERVER_URL` receives the bearer token when the opt-in Axios
integration is used, so it must use HTTPS and allow the application origin
through CORS.

### Service fallbacks

`UserService.isInitialized()` resolves `false` on network or HTTP errors
instead of rejecting, so setup code can gate on it safely.
`RefreshIntervalService.get()` falls back to `"10000"` when the stored value is
missing or malformed; `set()` normalises valid non-negative integer strings
(for example `"05000"` becomes `"5000"`) and throws `TypeError` otherwise.
`"0"` is valid and keeps polling disabled.

## Tokens and app-shell styles

The layer loads `assets/css/tokens.css` and `assets/css/app-shell.css`.
Tokens include `--color-*` (including the per-status foreground tokens
`--color-on-success`, `--color-on-error` and `--color-on-warning` used with
`--color-success`, `--color-error` and `--color-warning`),
`--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--header-height`, and
`--app-height`. Dark mode can be selected with `data-theme="dark"` or comes
from `prefers-color-scheme` when no explicit light preference is set. Status
colors meet WCAG AA against their `--color-on-*` foreground tokens in both
themes. The `dpb-fade-in` and `dpb-blink` helper classes are disabled under
`prefers-reduced-motion: reduce`.

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
