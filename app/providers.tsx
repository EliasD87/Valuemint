"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/config/wagmi";

/**
 * Client-side providers.
 *
 * Wallet state cannot exist on a server, so everything below this boundary is a
 * client component. The QueryClient is created inside state rather than at module
 * scope: at module scope it would be shared across requests on the server and
 * leak one visitor's cached data into another's render.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
            // Chain reads are cheap but not free, and blocks land every ~2s.
            staleTime: 10_000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
