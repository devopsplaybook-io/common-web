# PWA app-update playbook

The portfolio standard for detecting a new deployment and prompting the user
to update, shared by every `@devopsplaybook.io/common-web` `^0.16.0`
application.

## Purpose and scope

Update **detection and prompting** is shared. Each application keeps its own
service worker and caching strategy: the toolkit is service-worker-agnostic and
never assumes a particular caching implementation.

- Adoption is **opt-in**. Nothing in the package auto-registers a plugin, polls
  on import, or touches a service worker.
- The shared pieces are `BuildVersionProbe` (detection), `AppUpdateService`
  (scheduling), `useAppUpdate` (Vue wrapper), `AppUpdateNotice` (accessible
  prompt) and `acceptServiceWorkerUpdate` (activation helper).
- A prompt is the **default**. Silent `autoUpdate` reloads can discard form
  input and are painful to reverse.

Detection prefers the framework signal: Nuxt 4 publishes
`/_nuxt/builds/latest.json` (`{ "id": "<buildId>" }`). Fall back to scraping
`/index.html` only when the manifest is unavailable.

## Caching matrix

HTTP caching is what makes an update detectable immediately: the shell and the
build manifest must never be served stale, while hashed assets can be cached
forever.

| Path | Header | Notes |
| --- | --- | --- |
| `/_nuxt/*` (content-hashed) | `public, max-age=31536000, immutable` | Safe to cache forever: the filename changes per build. **Except** `/_nuxt/builds/*`. |
| `/_nuxt/builds/*` | `no-cache` | The update signal. Must revalidate on every request. |
| `/sw.js` | `no-cache` | Browsers bypass the HTTP cache for the SW script by default; be explicit anyway. |
| `/index.html` | `no-cache` | The shell must point at the current hashed assets. |
| API (`/api/*`) | `no-store` for auth and mutating responses | Never cache per-user data in the HTTP cache. |

A Nitro `routeRules` example (most specific first; Nitro matches the most
specific rule, the order here is for readability):

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    "/_nuxt/builds/**": { headers: { "cache-control": "no-cache" } },
    "/sw.js": { headers: { "cache-control": "no-cache" } },
    "/index.html": { headers: { "cache-control": "no-cache" } },
    "/_nuxt/**": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
    "/api/**": { headers: { "cache-control": "no-store" } },
  },
});
```

### Service-worker caching rules

- **Keep `/_nuxt/builds/*` out of every service-worker cache.** A cached
  manifest can never report a new build. Use a network passthrough:

  ```ts
  // @vite-pwa/nuxt
  pwa: {
    workbox: {
      globIgnores: ["**/_nuxt/builds/**"],
      navigateFallbackDenylist: [/\/_nuxt\/builds\//],
      runtimeCaching: [
        { urlPattern: /\/_nuxt\/builds\//, handler: "NetworkOnly" },
      ],
    },
  },
  ```

- **Runtime caching for GETs only.** Use `NetworkFirst` for data that must be
  fresh and `StaleWhileRevalidate` for non-critical reads. Never cache
  mutating responses.

- **Partition per-user caches and clear them on logout or user switch.** Use a
  per-user cache name such as `<app>-data-<userId>` and delete the private
  caches when the session changes; never delete the precache:

  ```ts
  import {
    EventBus,
    EventTypes,
  } from "@devopsplaybook.io/common-web/composables/EventBus";

  const PRIVATE_CACHE_PREFIX = "my-app-data-";

  EventBus.on(EventTypes.AUTH_UPDATED, async () => {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(PRIVATE_CACHE_PREFIX))
        .map((name) => caches.delete(name)),
    );
  });
  ```

  `AUTH_UPDATED` fires on sign-in, sign-out and token refresh, so the filter
  (not the event name) is what scopes this to private data caches.

## Service-worker strategy selection

| Strategy | Use when | Apps |
| --- | --- | --- |
| Custom service worker | The app needs media, HTTP range requests or storage quotas. | `book-reader`, `chinesetextreader`, `feedwatcher` — keep them. |
| `@vite-pwa/nuxt` `generateSW` | Default for new and simple apps. | Most of the portfolio. |
| `@vite-pwa/nuxt` `injectManifest` | You need custom logic but still want Workbox precaching. | When `generateSW` is not enough. |

**Never migrate an application's service worker as part of adopting the update
toolkit.** The update PR changes detection and the prompt only; the service
worker implementation is out of scope.

## Update lifecycle

1. Keep the old service worker controlling until the user accepts. A waiting
   worker stays parked until `SKIP_WAITING`.
2. Detect via `/_nuxt/builds/latest.json`, not by scraping HTML.
3. Check when the app loads, when the tab becomes visible, when the browser
   comes back `online`, and on `focus`, plus a **5–15 minute interval**. Never
   poll hidden tabs.
4. When a new build is detected, call `registration.update()` so the browser
   fetches the new service worker if one changed.
5. Register the service worker with `updateViaCache: "none"` so the `sw.js`
   fetch itself is not served from the HTTP cache.

`AppUpdateService`, `useAppUpdate` and `BuildVersionProbe` already implement
steps 2, 3 and 4 (the probe uses `cache: "no-store"` with a timeout and no
polling of hidden tabs).

## Protecting user work

An update prompt must never silently discard what the user is doing.

- Preserve the URL and in-app state across the reload (hash routes, selected
  item, scroll position — restore them on mount).
- **Flush offline queues before reloading.** Pass a `beforeReload` callback: it
  is awaited before the reload, and throwing from it **vetoes** the reload so
  the prompt can stay open.
- Do not reload when the app is offline and pending work cannot be flushed:

  ```ts
  const { updateAvailable, reload, dismiss } = useAppUpdate({
    currentBuildId: buildId,
    fetchLatestBuildId: createBuildVersionProbe(),
    beforeReload: async () => {
      if (!navigator.onLine) throw new Error("offline: pending work not flushed");
      await flushOfflineQueue();
    },
  });
  ```

## Integration recipes

All three recipes use the same building blocks. Pick the one that matches your
service worker.

### (a) Custom service worker or no service worker

Use the shared probe for detection, `useAppUpdate` for scheduling and
`AppUpdateNotice` for the prompt. Reloading is a plain reload.

```vue
<!-- app.vue -->
<script setup lang="ts">
import { createBuildVersionProbe } from "@devopsplaybook.io/common-web/services/BuildVersionProbe";

// Nuxt layer: `useAppUpdate` and `AppUpdateNotice` are auto-imported.
// Non-layer hosts: import them from their deep paths instead (see README).
const config = useRuntimeConfig();

const { updateAvailable, reload, dismiss } = useAppUpdate({
  currentBuildId: String(config.app.buildId ?? ""),
  fetchLatestBuildId: createBuildVersionProbe(),
  beforeReload: async () => {
    await flushOfflineQueue();
  },
});
</script>

<template>
  <AppUpdateNotice
    :visible="updateAvailable"
    @reload="reload"
    @later="dismiss"
  />
</template>
```

If the app customizes `baseURL` or `buildAssetsDir`, pass the matching URLs:
`createBuildVersionProbe({ manifestUrl, fallbackShellUrl })`.

### (b) Custom service worker with a waiting worker

Register with `updateViaCache: "none"`, detect the new build with the shared
probe, and let the helper activate the waiting worker and reload once.

```ts
// plugins/pwa-update.client.ts
import { createBuildVersionProbe } from "@devopsplaybook.io/common-web/services/BuildVersionProbe";
import { acceptServiceWorkerUpdate } from "@devopsplaybook.io/common-web/services/ServiceWorkerUpdate";

export default defineNuxtPlugin(async () => {
  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.register("/sw.js", {
    updateViaCache: "none",
  });
  return {
    provide: { pwaRegistration: registration },
  };
});
```

```vue
<!-- app.vue -->
<script setup lang="ts">
import { watch } from "vue";
import { createBuildVersionProbe } from "@devopsplaybook.io/common-web/services/BuildVersionProbe";
import { acceptServiceWorkerUpdate } from "@devopsplaybook.io/common-web/services/ServiceWorkerUpdate";

const { $pwaRegistration } = useNuxtApp();
const config = useRuntimeConfig();

const { updateAvailable, reload, dismiss } = useAppUpdate({
  currentBuildId: String(config.app.buildId ?? ""),
  fetchLatestBuildId: createBuildVersionProbe(),
  beforeReload: async () => {
    await flushOfflineQueue();
  },
});

// A new build usually ships a new sw.js: ask the browser to fetch it now.
watch(updateAvailable, (available) => {
  if (available) void $pwaRegistration?.update();
});

async function accept() {
  await acceptServiceWorkerUpdate({
    registration: $pwaRegistration,
    reload: () => void reload(),
  });
}
</script>

<template>
  <AppUpdateNotice
    :visible="updateAvailable"
    @reload="accept"
    @later="dismiss"
  />
</template>
```

`acceptServiceWorkerUpdate` posts `{ type: "SKIP_WAITING" }`, waits for
`controllerchange`, then reloads exactly once; it falls back to a plain reload
when there is no waiting worker or after a 10 s timeout.

### (c) `@vite-pwa/nuxt` with `registerType: "prompt"`

Keep the PWA plugin in `prompt` mode, never precache `/_nuxt/builds/*`, and
drive the same banner from the shared probe **or** `$pwa.needRefresh`.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@vite-pwa/nuxt"],
  pwa: {
    registerType: "prompt",
    workbox: {
      globIgnores: ["**/_nuxt/builds/**"],
      navigateFallbackDenylist: [/\/_nuxt\/builds\//],
      runtimeCaching: [
        { urlPattern: /\/_nuxt\/builds\//, handler: "NetworkOnly" },
      ],
    },
    manifest: {
      name: "My app",
      short_name: "App",
      display: "standalone",
    },
  },
});
```

```vue
<!-- app.vue -->
<script setup lang="ts">
import { createBuildVersionProbe } from "@devopsplaybook.io/common-web/services/BuildVersionProbe";
import { acceptServiceWorkerUpdate } from "@devopsplaybook.io/common-web/services/ServiceWorkerUpdate";

const { $pwa } = useNuxtApp();
const config = useRuntimeConfig();

const { updateAvailable, reload, dismiss } = useAppUpdate({
  currentBuildId: String(config.app.buildId ?? ""),
  fetchLatestBuildId: createBuildVersionProbe(),
  beforeReload: async () => {
    await flushOfflineQueue();
  },
});

async function accept() {
  if ($pwa?.updateServiceWorker) {
    // Activate the new worker without letting the plugin reload: the shared
    // reload flushes the offline queue first and reloads exactly once.
    await $pwa.updateServiceWorker(false);
    await reload();
    return;
  }
  await acceptServiceWorkerUpdate({
    registration: $pwa?.getSWRegistration?.() ?? null,
    reload: () => void reload(),
  });
}

function later() {
  $pwa?.cancelPrompt?.();
  dismiss();
}
</script>

<template>
  <AppUpdateNotice
    :visible="updateAvailable || Boolean($pwa?.needRefresh)"
    @reload="accept"
    @later="later"
  />
</template>
```

`updateServiceWorker(true)` would let the plugin reload for you; use it only
when there is nothing to flush, otherwise the offline queue is skipped.

## Testing

- **Vitest with fake timers** for `AppUpdateService` and `useAppUpdate`:
  intervals, hidden-tab pausing, single in-flight requests, dismissal per build
  and the `beforeReload` veto.
- **Component tests**: render `AppUpdateNotice` visible and hidden, assert the
  always-mounted `role="status"` / `aria-live="polite"` live region, the emitted
  `reload`/`later` events and keyboard operability. Add an SSR render and an
  axe accessibility check.
- **Playwright** with `serviceWorkers: "block"` and a faked manifest for
  determinism:

  ```ts
  test.use({ serviceWorkers: "block" });

  await page.route("**/_nuxt/builds/latest.json", (route) =>
    route.fulfill({ json: { id: "build-2" } }),
  );
  ```

  Then assert the banner appears, is announced and that **Later** dismisses it.
- Keep **one service-worker-enabled offline run** per app
  (`context.setOffline(true)`) to prove the offline mode still works after
  switching to a prompt.

## Adoption checklist

1. Bump the dependency to `^0.16.0`.
2. Pick the recipe for your service worker (a, b or c).
3. If the app uses `registerType: "autoUpdate"`, switch it to `"prompt"`.
4. Add the cache headers from the matrix (shell, `sw.js`, `/_nuxt/builds/*`).
5. Wire the banner into `app.vue` (or a layout) and mount it once.
6. Verify with the Playwright pattern above and keep an offline run.
7. **Do not change the service-worker implementation** in the adoption pull
   request.
