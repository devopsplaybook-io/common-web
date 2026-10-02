import axios, { AxiosHeaders } from "axios";
import type { AxiosInstance } from "axios";
import { AuthService } from "./AuthService";

const REGISTRATION_MARKER = Symbol.for("common-web.axios-auth");

type MarkedAxiosInstance = AxiosInstance & {
  [key: symbol]: unknown;
};

export function registerAxiosAuthInterceptors(
  instance: AxiosInstance = axios,
): boolean {
  const marked = instance as MarkedAxiosInstance;
  if (marked[REGISTRATION_MARKER]) {
    return false;
  }
  marked[REGISTRATION_MARKER] = true;

  instance.interceptors.request.use(async (config) => {
    const headers = AxiosHeaders.from(config.headers);
    if (headers.get("Authorization") != null) {
      return config;
    }

    const token = await AuthService.getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      config.headers = headers;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error?.response?.status === 401) {
        await AuthService.removeToken();
      }
      return Promise.reject(error);
    },
  );

  return true;
}
