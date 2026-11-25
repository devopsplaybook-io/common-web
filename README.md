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
| `<LoginCodeInput v-model="code" :error="error" />` | Eight-character code entry: uppercases, strips spaces and hyphens, supports paste and Enter-to-submit, and exposes an accessible name that spells the code. |
| `<LoginWithCodeCard :service="service" @approved="…" @use-password="…" @cancel="…" />` | Device-side flow: creates the request, shows and counts down the code, polls, and reports the redeemed session. |
| `<AuthorizeDeviceCard :service="service" @approved="…" @cancel="…" />` | Approver-side flow: previews the requesting device and approves the code, with an optional password step-up. |

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

### Standard client renewal: `startSessionRenewal()`

`AuthService.startSessionRenewal()` is the standard mechanism for every Nuxt
application. `getToken()` alone only renews when it is called again (for
example on a data access), so a tab that stays visible and idle can reach
expiry without ever renewing. The helper closes that gap:

```ts
// plugins/auth-renewal.client.ts
import { AuthService } from "@devopsplaybook.io/common-web/services/AuthService";

export default defineNuxtPlugin(() => {
  AuthService.startSessionRenewal();
});
```

It checks the token immediately, on `visibilitychange` while the document is
visible, on `focus`, and every five minutes (`SESSION_RENEWAL_CHECK_INTERVAL_MS`;
override with `startSessionRenewal({ intervalMs })`). Each check delegates to
`getToken()`, which renews through `POST /api/users/session/refresh` when 20 %
or less of the lifetime remains. The threshold must stay below the token
lifetime, otherwise it can never fire.

The helper is opt-in (nothing auto-starts it, and the layer registers no auth
plugin), idempotent (a second call returns the same stop function), safe to
call twice for stopping, and a no-op during SSR. The returned function clears
the interval and both listeners.

The session model of each application (validity, absolute cap, renewal
mechanism) is documented in the
[common-utils auth session policy](https://github.com/devopsplaybook-io/common-utils/blob/main/docs/auth-session-policy.md).

## Login with code

The layer ships a client for the cross-device "login with a code" protocol of
`@devopsplaybook.io/common-utils` 2.12.0, documented in
[`docs/login-with-code.md`](https://github.com/devopsplaybook-io/common-utils/blob/main/docs/login-with-code.md).
A device without usable credentials creates a short-lived request and shows an
8 character code; a device where the user is already signed in previews and
approves it; the first device redeems the approval for a session. This package
is the client and UI only: the routes, store and session issuance live in the
backend, and are disabled there unless `LOGIN_CODE_ENABLED=true`.

### `LoginCodeService`

`LoginCodeService` is plain ESM TypeScript with no Nuxt imports and no browser
globals, so it also runs during SSR.

```ts
import {
  LoginCodeError,
  LoginCodeService,
} from "@devopsplaybook.io/common-web/services/LoginCodeService";

const service = new LoginCodeService({
  // Optional: defaults to `${Config.SERVER_URL}/users/login-codes`.
  baseUrl: "/api/users/login-codes",
  // Optional: bearer header provider for preview/approve (the approver only).
  getAuthHeader: () => AuthService.getAuthHeader(),
  // Optional: persist the redeemed session (returned by approved polls).
  onSession: (token, user) => AuthService.saveToken(token),
});

const capabilities = await service.capabilities();
if (capabilities.available) {
  const request = await service.create(); // { requestToken, code, … }
  const poll = await service.poll(request.requestToken); // pending | approved | …
}
```

| Method | Request |
| --- | --- |
| `capabilities({ signal? })` | `GET <prefix>/capabilities` |
| `create({ signal? })` | `POST <prefix>/` (the trailing slash is added) |
| `poll(requestToken, { refreshCode?, signal? })` | `POST <prefix>/poll` |
| `preview(code, { signal? })` | `POST <prefix>/preview`, authenticated |
| `approve({ code, password? }, { signal? })` | `POST <prefix>/approve`, authenticated |
| `cancel(requestToken, { signal? })` | `POST <prefix>/cancel` |

Every method accepts an `AbortSignal` and resolves with the parsed response body;
requests time out after 10 seconds by default (`timeoutMs` option). Failures
throw `LoginCodeError` with a stable `code`, an optional HTTP `status` and a
`retryable` flag. The backend codes are `INVALID_CODE`, `ALREADY_USED`,
`RATE_LIMITED`, `LOGIN_CODE_UNAVAILABLE`, `PASSWORD_REQUIRED`,
`UNAUTHENTICATED` and `FORBIDDEN`; transport and parsing failures map to
`NETWORK`, `TIMEOUT`, `ABORTED`, `HTTP_ERROR`, `INVALID_RESPONSE` or `FAILED`.
Messages are fixed and never include a code, a request token or a response body,
so they are safe to log. `getAuthHeader` may return a header map or `{ headers }`
and may be async; if it throws, the call fails with `UNAUTHENTICATED` rather than
sending an unauthenticated approval. A rejected `onSession` does not turn a
successful redemption into an error.

### `useLoginCode()`

`useLoginCode({ service?, onSession? })` owns the device-side state machine and
is safe during SSR (it touches browser APIs only in `onMounted`). It exposes:

- `status`: `idle`, `creating`, `waiting`, `approved`, `expired`, `cancelled` or
  `error`; `code`, `formattedCode` (grouped as `BCDF-GHJK`), `error`,
  `capabilities`, `enabled`, `available`, `session` and `user`;
- `secondsUntilRefresh` and `secondsUntilExpiry`, countdowns computed against the
  server clock (the offset is derived from each response's `serverTime`, never
  from the local clock alone);
- `start()`, `cancel()` and `retry()`.

`start()` loads the capabilities and, when available, creates one request and
polls every `pollIntervalMs` (2 seconds by default). While the page is hidden
polling pauses and in-flight requests are aborted; it resumes immediately on
`visibilitychange` or `focus`. Poll failures back off exponentially (up to 30
seconds) and stop after 5 consecutive failures. A rotation that returns a new
code replaces the displayed one; otherwise no code is exposed again. `approved`
stores the session and calls `onSession`; `expired`, `cancelled` and `failed`
are terminal, as is `error`. `cancel()` is best-effort and a no-op outside
`creating`/`waiting`. Unmounting aborts requests, clears timers and invalidates
pending continuations.

### Components

`<LoginCodeInput v-model="code" label="Login code" :error="error" :length="8" />`
renders a visible label, normalises input to the documented alphabet (uppercase,
spaces and hyphens stripped), prevents paste from doubling characters and emits
`submit` on Enter when complete. Its accessible name spells the characters
(`Login code: B C D F G H J K`), and an `error` renders a `role="alert"` message
linked by `aria-describedby`.

`<LoginWithCodeCard>` shows the created code with copy, refresh and expiry
countdowns, a polite live status region and Cancel / Use password instead /
Try again actions. Try again appears after an error, expiry or cancellation and
starts a fresh request. Props: `service`, `autoStart` (default `true`), `onSession`
and `labels` (a `Partial` of the English defaults: `title`, `instructions`,
`codeLabel`, `preparing`, `waiting`, `approved`, `expired`, `cancelled`, `error`,
`unavailable`, `refreshIn` / `expiresIn` (`{seconds}` placeholder), `copy`,
`copied`, `cancel`, `usePassword`, `retry`). Events: `approved` with
`{ token, user }` (emitted after `onSession` settles), `cancel` and
`use-password`, so the host can switch to its password form.

`<AuthorizeDeviceCard>` previews the requesting device label, raw user agent,
request and expiry times and the approving account before approval, and requires
a password only when the capabilities say so. Props: `service` and `labels`
(`title`, `warning`, `codeLabel`, `preview`, `approve`, `cancel`, `password`,
`willSignInAs`, `deviceLabel`, `userAgentLabel`, `requestedAt`, `expiresAt`,
`approved`, `unavailable`, `preparing`, `invalidCode`, `alreadyUsed`,
`rateLimited`, `passwordRequired`, `unauthenticated`, `forbidden`, `network`,
`generic`). Events: `approved` with the approval body and `cancel`. Error copy
is local and generic; the server message is never rendered. Both cards render a
live region only for status changes, and `AuthorizeDeviceCard` keeps the warning
visible in every state.

Both cards accept `variant` (`"card"` by default, or `"plain"` to drop their own
border, radius, background, shadow and outer padding when they are embedded in a
host card or section) and `headingLevel` (`2`, `3` or `4`, default `2`) so the
title matches the surrounding heading structure. The `aria-labelledby` wiring
follows the rendered heading id.

### Using the layer

With the layer extended, the components and composable are auto-imported:

```vue
<script setup lang="ts">
import { AuthService } from "@devopsplaybook.io/common-web/services/AuthService";
import { LoginCodeService } from "@devopsplaybook.io/common-web/services/LoginCodeService";

const service = new LoginCodeService({
  getAuthHeader: () => AuthService.getAuthHeader(),
});

function signedIn({ token }: { token: string }) {
  AuthService.saveToken(token);
  AuthService.startSessionRenewal();
}
</script>

<template>
  <LoginWithCodeCard :service="service" @approved="signedIn" @use-password="showPassword = true" />
</template>
```

Approving must happen on a device with an interactive session; a backend API
token cannot approve (`403 FORBIDDEN`). Always pass a token provider for the
approver (`getAuthHeader`), and treat `409 ALREADY_USED`, `expired`, `cancelled`
and `failed` as "start a new request".

Outside a Nuxt layer (plain Vue/Vite or a non-extending app), import the files
explicitly and transpile the package:

```ts
// vite.config.ts / nuxt.config.ts
export default defineConfig({
  build: { transpile: ["@devopsplaybook.io/common-web"] },
  vite: {
    optimizeDeps: { exclude: ["@devopsplaybook.io/common-web"] },
  },
});
```

```vue
<script setup lang="ts">
import LoginWithCodeCard from "@devopsplaybook.io/common-web/components/LoginWithCodeCard.vue";
import LoginCodeInput from "@devopsplaybook.io/common-web/components/LoginCodeInput.vue";
import AuthorizeDeviceCard from "@devopsplaybook.io/common-web/components/AuthorizeDeviceCard.vue";
import { useLoginCode } from "@devopsplaybook.io/common-web/composables/useLoginCode";
import { LoginCodeService } from "@devopsplaybook.io/common-web/services/LoginCodeService";
</script>
```

The shipped files import only `vue`, `axios`, `./Config`, the login-code service
and each other; a regression test fails if Nuxt auto-imports (`#imports`,
`useRuntimeConfig`, `navigateTo`, …) creep in. The feature adds no runtime
dependency: the service reuses the package's existing axios dependency (the
theme-contract test adds `postcss` as a dev-only dependency).

### Theming and non-layer hosts

`LoginCodeInput`, `LoginWithCodeCard` and `AuthorizeDeviceCard` theme themselves
from the host application's tokens, so they work in the Nuxt layer (which ships
`assets/css/tokens.css`) and when the SFCs are imported directly into a plain
Vue/Nuxt app that defines only a partial palette. Every component root carries
the `lc-theme` class and maps the host tokens onto internal `--lc-*` variables.

No token is strictly required: each has a fallback. For a faithful theme, define:

| Token | Use |
| --- | --- |
| `--color-surface` | card and input background |
| `--color-text` | body, code, labels and button text |
| `--color-text-muted` | instructions, countdowns and secondary labels |
| `--color-border` | card, input and secondary-button borders |
| `--color-primary`, `--color-primary-hover` | primary buttons, links, focus rings |
| `--color-on-primary` | primary-button label |
| `--color-warning` | warning callout accent (used as a tint, not a fill) |
| `--color-error` **or** `--color-danger` | error text and the invalid input border |
| `--color-success` | approval confirmation |

Optional: `--color-surface-raised` (otherwise derived with `color-mix()` as 5 %
of the text colour over the surface, tinted with the host palette) and either
`--space-base` or `--space-md` (plus `--space-xs/sm/lg/xl` when present). Host
tokens always win; the fallbacks only fill the gaps.

Warning and error states are callouts — text in `--lc-text` on a tinted (or
transparent) background with an accent border — so hosts do not need
`--color-on-warning` or `--color-on-error` for these components.

The `light-dark()` fallbacks used by token-less hosts follow the inherited CSS
`color-scheme`. The layer and Planner set it; a token-less host should too:

```css
:root {
  color-scheme: light dark;
}
```

Browsers without `light-dark()` or `color-mix()` fall back to the light palette
and a transparent warning callout with a solid accent border. Text contrast
follows the host tokens: with a faithful palette the components meet WCAG 2.2 AA
in light and dark. Secondary text is bounded by `--color-text-muted`, so a muted
token that is too light (for example a grey below 4.5:1 on the surface) caps the
contrast the library can offer.

Override individual values through the `--lc-*` variables on the component or any
ancestor without redefining the whole host palette:

```css
.lc-theme {
  --lc-space-sm: var(--space-sm, 0.5rem);
  --lc-space: var(--space-base, var(--space-md, 1rem));
  --lc-space-lg: var(--space-lg, 1.5rem);
  --lc-space-xl: var(--space-xl, 2rem);

  --lc-surface: var(--color-surface, #fff);
  --lc-raised: var(--color-surface-raised, #f5f5f5);
  --lc-text: var(--color-text, #171717);
  --lc-muted: var(--color-text-muted, #5f6368);
  --lc-border: var(--color-border, #d6d6d6);
  --lc-primary: var(--color-primary, #c62828);
  --lc-primary-hover: var(--color-primary-hover, #a61f1f);
  --lc-on-primary: var(--color-on-primary, #fff);
  --lc-warning: var(--color-warning, #8a5a00);
  --lc-danger: var(--color-error, var(--color-danger, #b3261e));
  --lc-success: var(--color-success, #2e7d32);
}
```

Embed the cards in an existing card or section with `variant="plain"` (no border,
radius, background, shadow or outer padding) and match the heading structure with
`headingLevel`:

```vue
<article class="login-card">
  <LoginWithCodeCard
    :service="service"
    variant="plain"
    :heading-level="3"
    @approved="signedIn"
  />
</article>
```

`tests/theme-contract.spec.ts` guards the contract: no raw colour literals in
colour declarations, only documented host tokens, `--color-on-primary` shipped in
every theme block, and the spacing bridge through `--lc-space`.

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
- `useLoginCode()` loads capabilities and starts polling only in `onMounted`, so
  the server renders `idle` (the card shows `Preparing a code…`); `LoginCodeService`
  touches no browser global and is safe to call from a server context.
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
`--color-on-primary`, `--color-on-success`, `--color-on-error` and
`--color-on-warning` used with `--color-primary`, `--color-success`,
`--color-error` and `--color-warning`),
`--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--header-height`, and
`--app-height`. Dark mode can be selected with `data-theme="dark"` or comes
from `prefers-color-scheme` when no explicit light preference is set. Status
colors meet WCAG AA against their `--color-on-*` foreground tokens in both
themes. `--color-primary` and `--color-primary-hover` are defined in both
themes and meet AA (4.5:1) on the shipped `--color-surface` and
`--color-surface-raised` backgrounds, and `--color-on-primary` meets AA on
`--color-primary`. `tests/contrast.spec.ts` gates text,
muted text, primary, primary hover, the primary label and the status color pairs
in the light and both dark blocks. The `dpb-fade-in` and `dpb-blink` helper classes are disabled
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
