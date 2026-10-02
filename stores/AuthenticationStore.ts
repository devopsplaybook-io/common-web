import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import { EventBus, EventTypes } from "../composables/EventBus";
import { AuthService } from "../services/AuthService";

export function createAuthenticationStore() {
  return defineStore("AuthenticationStore", () => {
    const isAuthenticated = ref(false);

    async function refreshAuthentication(): Promise<void> {
      isAuthenticated.value = await AuthService.isAuthenticated();
    }

    async function ensureAuthenticated(): Promise<boolean> {
      await refreshAuthentication();
      return isAuthenticated.value;
    }

    if (typeof window !== "undefined") {
      EventBus.on(EventTypes.AUTH_UPDATED, () => {
        void refreshAuthentication();
      });
    }

    return { isAuthenticated, ensureAuthenticated };
  });
}

export const AuthenticationStore = createAuthenticationStore();

if (import.meta.hot) {
  import.meta.hot.accept(
    acceptHMRUpdate(AuthenticationStore, import.meta.hot),
  );
}
