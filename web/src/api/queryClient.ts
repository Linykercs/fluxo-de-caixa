import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

function handleError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
