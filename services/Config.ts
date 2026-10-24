export interface AppConfig {
  SERVER_URL: string;
}

const DEFAULT_CONFIG: AppConfig = { SERVER_URL: "/api" };

export default class Config {
  private static overrides: Partial<AppConfig> = {};

  static async get(): Promise<AppConfig> {
    return { ...DEFAULT_CONFIG, ...Config.overrides };
  }

  static set(config: Partial<AppConfig>): void {
    Config.overrides = { ...Config.overrides, ...config };
  }

  static reset(): void {
    Config.overrides = {};
  }
}
