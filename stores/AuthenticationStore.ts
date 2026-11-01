import { acceptHMRUpdate, defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";
import { EventBus, EventTypes } from "../composables/EventBus";
import { AUTH_TOKEN_KEY, AuthService } from "../services/AuthService";

let storageSyncRegistered = false;

function registerStorageSync(): void {
  if (storageSyncRegistered) return;
  storageSyncRegistered = true;
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === AUTH_TOKEN_KEY) {
      EventBus.emit(EventTypes.AUTH_UPDATED, undefined);
    }
  });
}

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
      const handleAuthUpdated = () => {
        void refreshAuthentication();
      };
      EventBus.on(EventTypes.AUTH_UPDATED, handleAuthUpdated);
      onScopeDispose(() => {
        EventBus.off(EventTypes.AUTH_UPDATED, handleAuthUpdated);
      });
      registerStorageSync();
    }

    return { isAuthenticated, ensureAuthenticated, refreshAuthentication };
  });
}

export const AuthenticationStore = createAuthenticationStore();

if (import.meta.hot) {
  import.meta.hot.accept(
    acceptHMRUpdate(AuthenticationStore, import.meta.hot),
  );
}
