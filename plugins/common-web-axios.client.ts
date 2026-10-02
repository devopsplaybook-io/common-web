import { registerAxiosAuthInterceptors } from "../services/AxiosAuthInterceptor";

export default defineNuxtPlugin(() => {
  registerAxiosAuthInterceptors();
});
