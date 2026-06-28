import { QueryClient } from "@tanstack/react-query";

// Server state lives in TanStack Query (§2.1).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
