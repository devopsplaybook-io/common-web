export class RefreshIntervalService {
  static readonly KEY = "REFRESH_INTERVAL";
  static readonly DEFAULT = "10000";

  static get(): string {
    return localStorage.getItem(RefreshIntervalService.KEY) ?? RefreshIntervalService.DEFAULT;
  }

  static set(value: string): void {
    localStorage.setItem(RefreshIntervalService.KEY, value);
  }
}
