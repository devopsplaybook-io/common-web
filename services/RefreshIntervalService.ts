export class RefreshIntervalService {
  static readonly KEY = "REFRESH_INTERVAL";
  static readonly DEFAULT = "10000";

  static get(): string {
    const stored = localStorage.getItem(RefreshIntervalService.KEY);
    if (stored === null) return RefreshIntervalService.DEFAULT;
    return (
      RefreshIntervalService.normalise(stored) ??
      RefreshIntervalService.DEFAULT
    );
  }

  static set(value: string): void {
    const normalised = RefreshIntervalService.normalise(value);
    if (normalised === null) {
      throw new TypeError(
        `Invalid refresh interval: ${String(value)} (expected a non-negative integer string)`,
      );
    }
    localStorage.setItem(RefreshIntervalService.KEY, normalised);
  }

  private static normalise(value: string): string | null {
    if (!/^\d+$/.test(value)) return null;
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) return null;
    return String(numeric);
  }
}
