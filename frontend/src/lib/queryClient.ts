import { QueryClient, MutationCache } from "@tanstack/react-query";
import { toast } from "./toast";

// Server state lives in TanStack Query (§2.1). Any failed mutation surfaces a
// toast automatically, so no action can fail silently.
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      toast.error(message);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
