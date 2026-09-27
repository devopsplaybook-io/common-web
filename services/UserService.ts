import axios from "axios";
import Config from "./Config";

export class UserService {
  static async isInitialized(): Promise<boolean> {
    const config = await Config.get();
    const response = await axios.get<{ initialized: boolean }>(
      `${config.SERVER_URL}/users/status/initialization`,
    );
    return response.data.initialized;
  }
}
