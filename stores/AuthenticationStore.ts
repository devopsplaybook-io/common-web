import { acceptHMRUpdate, defineStore } from "pinia";
import { AuthService } from "../services/AuthService";

export function createAuthenticationStore() {
  return defineStore("AuthenticationStore", {
    state: () => ({
      isAuthenticated: false,
    }),

    actions: {
      async ensureAuthenticated(): Promise<boolean> {
        this.isAuthenticated = await AuthService.isAuthenticated();
        return this.isAuthenticated;
      },
    },
  });
}

export const AuthenticationStore = createAuthenticationStore();

if (import.meta.hot) {
  import.meta.hot.accept(
    acceptHMRUpdate(AuthenticationStore, import.meta.hot),
  );
}
