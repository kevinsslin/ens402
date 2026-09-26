"use client";
import { useActiveWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { LogOut, Wallet } from "lucide-react";
import { activeEthereumWallet } from "./active-wallet";
import { Button } from "./ui/button";
/** Native Privy modal owns wallet selection; the navbar only provides its entry point. */
export function WalletNav() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallet: active, connect } = useActiveWallet();
  const wallet = activeEthereumWallet(wallets, active?.address);
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      aria-label="Wallet controls"
    >
      <Button
        variant="outline"
        className="rounded-full px-3"
        disabled={!ready || (authenticated && !walletsReady)}
        title={
          wallet
            ? `Active signing wallet: ${wallet.address}. Select a wallet with Privy.`
            : "Sign in with Privy"
        }
        onClick={() =>
          authenticated ? void connect().catch(() => {}) : login()
        }
      >
        <Wallet className="size-4" aria-hidden="true" />
        <span className="text-xs sm:text-sm">
          {!ready
            ? "Loading…"
            : authenticated && wallet
              ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
              : authenticated
                ? "Select wallet"
                : "Connect"}
        </span>
      </Button>
      {authenticated && (
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void logout()}
        >
          <LogOut className="size-4" />
        </Button>
      )}
    </div>
  );
}
