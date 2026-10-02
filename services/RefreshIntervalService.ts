export class RefreshIntervalService {
  static readonly KEY = "REFRESH_INTERVAL";
  static readonly DEFAULT = "10000";

  static get(): string {
    return localStorage.getItem(RefreshIntervalService.KEY) ?? RefreshIntervalService.DEFAULT;
  }

  static set(value: string): void {
    if (!/^\d+$/.test(value)) {
      throw new TypeError(
        `Invalid refresh interval: ${String(value)} (expected a non-negative integer string)`,
      );
    }
    localStorage.setItem(RefreshIntervalService.KEY, value);
  }
}
