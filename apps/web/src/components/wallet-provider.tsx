"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia, sepolia } from "viem/chains";
import type { ReactNode } from "react";
/** One Privy session and native active-wallet selection across all routes. */
export function WalletProvider({
  appId,
  children,
}: {
  appId?: string;
  children: ReactNode;
}) {
  if (!appId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#0054cc",
          walletChainType: "ethereum-only",
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, sepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
