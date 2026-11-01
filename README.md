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
| `<AlertMessages />` | Accessible live regions displaying messages emitted on `EventBus`, each with a per-message **Dismiss** button. |
| `<AppNavigation :links="links" :link-component="NuxtLink" label="Primary" />` | Navigation shell with a named `brand` slot, configurable links (`label`, `to`, optional `icon` and `active`) and an optional accessible `label`. |
| `<OfflineBanner message="You are offline." />` | Announces offline status and accepts replacement content through its default slot. |

`AlertMessages` listens for `EventTypes.ALERT_MESSAGE` events. Its payload is
`{ text, type?, durationMs? }` with `type` limited to `info`, `success`,
`warning` or `error`. The default display duration is five seconds;
`durationMs: 0` keeps the message until the user activates its **Dismiss**
button. Negative durations are clamped to `0`, so they stay until dismissed;
non-finite values (`NaN`, `Infinity`) use the five-second default. Errors render
in an assertive `role="alert"` region and the other severities in a polite
`role="status"` region. The two regions are siblings and are always mounted, so
each message is announced exactly once. The Dismiss control is a native
`<button type="button">` with the accessible name `Dismiss` and a visible focus
ring. Identical `type` + `text` pairs are deduplicated and the queue keeps at
most five messages, dropping the oldest first. Alert styles use the prefixed
`.alert-message*` classes, so consumer stylesheets are not affected by the
layer's global styles. `handleError(error, { debug = false } = {})` logs a
sanitized summary (message, status, method, path without query string, and
headers with credentials redacted) and emits a corresponding error alert.
`debug: true` logs the raw error object, which may contain credentials, and is
intended for development only.

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

The `label` prop sets the navigation's accessible name and defaults to
`Main navigation`. Give each navigation on a page a distinct label so screen
reader users can tell them apart:

```vue
<AppNavigation :links="primaryLinks" label="Primary" />
<AppNavigation :links="secondaryLinks" label="Secondary" />
```

Links are keyed by target and position, so duplicate `to` targets still render;
in development the component logs a warning when it detects duplicates.

`OfflineBanner` keeps its `role="status"` live region mounted at all times so
screen readers announce the transition; while online the region is visually
hidden. The banner renders hidden in server HTML and reflects the real
connectivity right after hydration. The default copy is the neutral
`You are offline.`; replace it with the `message` prop or the default slot.

## Composables and services

- `useTheme()` persists `light`/`dark` preferences in `localStorage` and applies
  `data-theme` to the document root. State is a module-wide singleton: every
  `useTheme()` call shares the same `preference` and `isDark` refs, so a second
  call never sees a stale copy. A window `storage` listener keeps tabs in sync.
  `isDark` reflects the effective theme: the default `system` preference
  follows `prefers-color-scheme`, including live operating-system changes, and
  `toggleTheme()` toggles from that effective value. Use `setTheme("system")`
  to return to the operating-system preference. When `localStorage` is missing
  (SSR) or blocked (sandboxed iframe, privacy mode), the theme still applies
  and only persistence is skipped.
  The layer also injects a small pre-paint `<head>` script that applies
  `data-theme` from `localStorage` and `prefers-color-scheme` before first
  paint, so a stored dark preference no longer flashes the light theme during
  load. Applications with a strict CSP must allow this inline script (nonce or
  `unsafe-inline`); without it, the `prefers-color-scheme` CSS path still
  applies and the theme resolves after hydration.
  Set the `COMMON_WEB_THEME_SCRIPT_NONCE` environment variable at build time to
  add a nonce to the injected tag (it is read when `nuxt.config.ts` is
  evaluated). Per-request nonces are not supported by the shared layer: build
  the head entry with the exported
  `themeInitScriptEntry(nonce)` helper from
  `@devopsplaybook.io/common-web/composables/theme` and override
  `app.head.script` in the consuming application.
- `useAppHeight()` updates `--app-height` from `visualViewport` when available
  and cleans up resize listeners on unmount. Resize updates are coalesced with
  `requestAnimationFrame`, so repeated resize events and multiple component
  instances write the custom property at most once per frame. The pending frame
  is shared across instances and cancelled only when the last instance unmounts,
  so unmounting one component never cancels another one's update.
- `useOfflineStatus()` returns a reactive `isOnline` ref. It starts as `true`
  so server HTML and the first client render agree, then reads
  `navigator.onLine` after mount and follows the `online`/`offline` events, so a
  page loaded offline shows the offline banner right after hydration without a
  hydration mismatch.
- Services are available through package deep imports, for example
  `@devopsplaybook.io/common-web/services/AuthService`. `AuthService`,
  `PreferencesService` and `RefreshIntervalService` guard every `localStorage`
  access through an internal `BrowserStorage` helper, so during SSR or with
  blocked storage reads return their documented fallback and writes are no-ops.
- `createAuthenticationStore()` returns the Pinia store definition; `Pinia`
  must be available in the consuming app.

The canonical auth storage key is `auth_token`. During this compatibility
release, `AUTH_TOKEN` and `AUTH_TOKEN_KEY` are read and migrated to the
canonical key. Tokens remain in `localStorage`, matching existing applications.
When an authenticated token has entered the final 20% of its lifetime,
`AuthService` renews it through `POST /api/users/session/refresh` in the
background. `getToken()` and `getAuthHeader()` return the still-valid current
token immediately and the next call sees the renewed token, so a slow refresh
endpoint never stalls a caller.

`getToken()` never rejects because of the stored or renewed token:

- A corrupt or undecodable token is treated as signed out: every auth key is
  removed, `AUTH_UPDATED` is emitted and `null` is returned. Expired tokens are
  removed and return `null`. A present `exp` or `iat` claim must be a finite
  number; tokens with string or otherwise malformed claims are corrupt.
- A `401` or `403` from the refresh endpoint means the session was revoked:
  the session is cleared, `AUTH_UPDATED` is emitted and `null` is returned.
- Timeouts and invalid renewal responses perform a single request. Network
  errors and `5xx` responses retry once after a 500 ms backoff.
- When renewal still fails, the still-valid current token is returned and
  further renewal attempts for that token are paused for 30 seconds. Renewal
  runs in the background, so the worst case is about 6.5 seconds of background
  work (two 3 s attempts plus the 500 ms backoff) and never blocks the caller.
  If the token expired during the attempt, the session is cleared and later
  calls return `null`.
- Renewal requests time out after 3 seconds and concurrent calls share a single
  request. A token saved while a renewal is in flight wins over the renewed
  value.
- Renewed tokens are validated (decodable, non-empty, future `exp`, and
  `exp > iat` when `iat` is present) before they are persisted.
- `AUTH_RENEWAL_FAILED` is emitted with `{ reason }`, where `reason` is one of
  `timeout`, `5xx`, `network` or `invalid-response`. It carries no token, URL or
  PII; consumers may instrument their own telemetry. This package adds no
  OpenTelemetry metric or dependency.

`removeToken()` clears every stored auth key. `removeToken(token)` is a
compare-and-remove operation: it clears the session only when the stored token
still equals `token`, so a stale response cannot discard a newer session.

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

`registerAxiosAuthInterceptors(instance = axios, { allowedOrigins = [],
loginPaths = ["/users/session"] } = {})` attaches `Authorization: Bearer
<token>` only when the request has no explicit `Authorization` header and the
effective target is allowed:

- relative URLs, the page origin, the origin of an absolute `Config.SERVER_URL`
  and any origin listed in `allowedOrigins` receive the token;
- cross-origin requests to any other origin receive no token, do not trigger a
  token renewal, and fail closed when an absolute URL cannot be parsed;
- `allowedOrigins` entries are normalised to origins and an invalid entry
  throws `TypeError`;
- registration is idempotent per Axios instance and returns `false` when
  already registered; options apply only on the first registration.

A `401` clears the stored token only when the failed request used the currently
stored token (the attached token is recorded on the request or parsed from the
sent `Authorization` header). A stale `401` is ignored, and a `401` from a
request that sent no token clears nothing. Login paths are configurable through
`loginPaths`: suffix matches on the effective pathname, default
`["/users/session"]`, replaced when configured, with empty entries ignored.
`loginPaths: []` exempts no path.

### Server URL configuration

`Config.get()` returns `{ SERVER_URL: "/api" }` by default. Inject a different
base URL, for example from a Nuxt client plugin, and reset it for tests:

```ts
import Config from "@devopsplaybook.io/common-web/services/Config";

Config.set({ SERVER_URL: "https://api.example.com" });
await Config.get(); // { SERVER_URL: "https://api.example.com" }
Config.reset(); // back to "/api"
```

`Config.set()` trims whitespace and removes trailing slashes, so
`"https://api.example.com///"` and `"/api/"` become `"https://api.example.com"`
and `"/api"`. In development it warns when the URL uses `http:` and is not a
loopback host (`localhost`, `127.0.0.1`, `[::1]`). A non-same-origin
`SERVER_URL` must use HTTPS and allow the application origin through CORS;
cross-origin requests receive the bearer token only when that origin is the
configured `SERVER_URL` origin or listed in `allowedOrigins`.

### Service fallbacks

`UserService.isInitialized({ timeoutMs = 5000, signal, cacheTtlMs = 0 } = {})`
resolves `false` on network or HTTP errors instead of rejecting, so setup code
can gate on it safely. Each request is bounded by `timeoutMs` (5 s by default)
and accepts an optional `AbortSignal`. With `cacheTtlMs > 0` a successful
`true` result is reused for that duration (keyed by URL); `false` is never
cached and `cacheTtlMs: 0` disables the cache. Failures log a warning with a
`reason` (`timeout`, `aborted`, `http-<status>` or `network`) and no URL, token
or response body.
`RefreshIntervalService.get()` falls back to `"10000"` when the stored value is
missing or malformed; `set()` normalises valid non-negative integer strings
(for example `"05000"` becomes `"5000"`) and throws `TypeError` otherwise.
`"0"` is valid and keeps polling disabled. Both `PreferencesService` and
`RefreshIntervalService` tolerate missing or blocked storage: reads return
`null` / `"10000"` and writes are skipped, so they are safe during SSR; an
invalid `set()` value still throws `TypeError`.

## SSR and client-only usage

The layer is SSR-compatible: the components render on the server, and the
composables guard their browser-only access.

- `useTheme()` keeps module-level state, but touches `document`, `window` and
  `localStorage` only in `onMounted` (which never runs during SSR) and through
  the guarded `BrowserStorage` helper; the server always renders the default
  `system` preference.
- `useOfflineStatus()` initialises `isOnline` to `true`, so the server and the
  first client render agree; the real value is read in `onMounted`, so an
  offline page shows the banner right after hydration instead of in server
  HTML.
- `useAppHeight()` touches `window` only inside `onMounted`.
- `AuthService`, `PreferencesService` and `RefreshIntervalService` guard every
  `localStorage` access: during SSR reads return their documented fallback and
  writes are no-ops.

Token storage, session renewal, `AUTH_UPDATED` propagation, cross-tab
synchronisation and the opt-in Axios integration are browser-only: register the
Axios helper from a `.client.ts` plugin as shown above, and expect the
authentication state to become meaningful only after hydration.

`tests/ssr.spec.ts` renders the shipped components with `createSSRApp` and
`renderToString` in a Node environment, so this server-rendering contract is
exercised by `npm test` and by both CI workflows.

## Tokens and app-shell styles

The layer loads `assets/css/tokens.css` and `assets/css/app-shell.css`.
Tokens include `--color-*` (including the per-status foreground tokens
`--color-on-success`, `--color-on-error` and `--color-on-warning` used with
`--color-success`, `--color-error` and `--color-warning`),
`--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--header-height`, and
`--app-height`. Dark mode can be selected with `data-theme="dark"` or comes
from `prefers-color-scheme` when no explicit light preference is set. Status
colors meet WCAG AA against their `--color-on-*` foreground tokens in both
themes. `--color-primary` and `--color-primary-hover` are defined in both
themes and meet AA (4.5:1) on the shipped `--color-surface` and
`--color-surface-raised` backgrounds. `tests/contrast.spec.ts` gates text,
muted text, primary, primary hover and the status color pairs in the light and
both dark blocks. The `dpb-fade-in` and `dpb-blink` helper classes are disabled
under `prefers-reduced-motion: reduce`.

Load app-specific CSS after the layer and redefine only the values you need:

```css
:root {
  --color-primary: #145da0;
  --header-height: 4.5rem;
}
```

### App-shell hooks

The app-shell stylesheet ships class hooks for the page frame and the
floating alert container:

```vue
<div class="page-layout">
  <AppNavigation :links="links" />
  <main>
    <NuxtPage />
    <AlertMessages class="page-alert-messages" />
  </main>
</div>
```

`#page-layout` and `#page-alert-messages` remain supported as legacy aliases
for existing consumers, so current markup keeps working. Prefer the classes in
new markup to avoid duplicate-ID collisions when several layouts mount.

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

This release supports Nuxt `^4.0.0` and Vue `^3.5.0`; Nuxt provides Vue, so a
Nuxt 4 application already satisfies that peer. Pinia
`^2.0.0 || ^3.0.0 || ^4.0.0` is an optional peer: only
`stores/AuthenticationStore` needs it, so applications that do not use the
store do not have to install it. Pinia 4 is ESM-only and requires the consuming
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
the shared `common-utils` npm workflows adopt the same gate.

### Packaging, types and side effects

The package ships raw Vue and TypeScript sources with no build step, so there is
deliberately no `types` or `exports.types` entry: type information comes from
the `.ts`/`.vue` sources themselves and deep imports resolve through the
`exports` map under Nuxt module resolution. `sideEffects` whitelists CSS and
`.vue` files so component styles and the token stylesheets are never
tree-shaken, while the side-effect-free `.ts` modules can be. `npm run build`
fails when any public file is missing from the packed tarball, and the packed
archive is what `npm test` runs against.

## Development

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run typecheck` runs `nuxi typecheck` (`vue-tsc --noEmit`) over the layer,
the playground and the tests and fails on type errors. `npm test` packs the
library and runs component, service and SSR tests against that archive.
`npm run build` validates its contents and builds the playground.
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and release details.
