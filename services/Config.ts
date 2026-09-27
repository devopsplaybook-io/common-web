export interface AppConfig {
  SERVER_URL: string;
}

export default class Config {
  static async get(): Promise<AppConfig> {
    return { SERVER_URL: "/api" };
  }
}
