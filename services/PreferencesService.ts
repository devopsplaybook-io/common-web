import { BrowserStorage } from "./BrowserStorage";

export const PreferencesService = {
  get(key: string): string | null {
    return BrowserStorage.get(key);
  },

  set(key: string, value: string): void {
    BrowserStorage.set(key, value);
  },

  remove(key: string): void {
    BrowserStorage.remove(key);
  },
};
