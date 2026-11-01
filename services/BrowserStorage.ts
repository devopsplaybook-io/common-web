function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Access itself throws in sandboxed iframes and with blocked storage.
    return null;
  }
}

// Every call tolerates missing or blocked storage: reads fall back to `null`
// and writes are skipped, so SSR and privacy modes never crash.
export const BrowserStorage = {
  get(key: string): string | null {
    const store = storage();
    if (!store) return null;
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  },

  set(key: string, value: string): void {
    const store = storage();
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch {
      // Quota exceeded or storage blocked after the initial access.
    }
  },

  remove(key: string): void {
    const store = storage();
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      // Storage blocked after the initial access.
    }
  },
};
