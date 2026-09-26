"use client";
import { useState } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { baseSepolia, sepolia } from "viem/chains";
import { Button } from "@/components/ui/button";
import { RegistrationConsole } from "./registration-console";
import { ProviderConsole } from "./provider-console";
import { MerchantConsole } from "./merchant-console";
import { DiscoveryConsole } from "./discovery-console";
import { OperatorConsole } from "./operator-console";

type Registration = {
  registrar: string;
  parent: string;
  restricted?: boolean;
  shared?: { resolver: string; ops: string; treasury: string };
};
function AccountWorkspace({
  registration,
  workspace,
  parent,
}: {
  registration?: Registration;
  workspace?: "provider" | "merchant";
  parent?: string;
}) {
  const {
    ready,
    authenticated,
    login,
    logout,
    getAccessToken,
    user,
    connectWallet,
  } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [selected, setSelected] = useState("");
  const wallet = wallets.find((w) => w.address === selected) ?? wallets[0];
  if (!ready || (authenticated && !walletsReady))
    return (
      <div className="section-shell py-20" role="status">
        Loading secure sign-in…
      </div>
    );
  if (!authenticated && !registration && !workspace)
    return (
      <>
        <DiscoveryConsole
          onSelect={(name) => {
            window.history.replaceState(
              null,
              "",
              `/console?service=${encodeURIComponent(name)}`,
            );
            login();
          }}
        />
        <div className="section-shell max-w-5xl pb-12">
          <Button variant="outline" onClick={() => login()}>
            Sign in to your purchases
          </Button>
        </div>
      </>
    );
  if (!authenticated)
    return (
      <section className="section-shell py-20">
        <p className="eyebrow">ENS402 Console</p>
        <h1 className="mt-4 text-4xl font-medium">
          {workspace === "provider"
            ? "Onboard your service."
            : registration
              ? "Publish your service."
              : "Your services."}
        </h1>
        <p className="mt-6 max-w-xl leading-7 text-muted-foreground">
          Sign in to register your service, manage its ENS settings and track
          activity.
        </p>
        <a
          href="/console"
          className="mt-6 block text-sm text-primary underline"
        >
          Browse services without signing in
        </a>
        <Button className="mt-8" onClick={() => login()}>
          Sign in
        </Button>
        <a href="/docs" className="ml-5 text-sm text-primary underline">
          SDK docs
        </a>
      </section>
    );
  return (
    <>
      <div className="section-shell flex flex-wrap items-center justify-between gap-3 border-b py-3">
        <p className="text-sm">
          {user?.email?.address || "Account"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {wallets.length > 0 && (
            <label className="text-xs">
              Connected wallet
              <select
                aria-label="Connected wallet"
                className="ml-2 max-w-52 rounded-md border bg-background p-2"
                value={wallet?.address ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {wallets.map((w) => (
                  <option
                    key={`${w.address}-${w.walletClientType}`}
                    value={w.address}
                  >
                    {w.address.slice(0, 8)}…{w.address.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="outline" onClick={() => connectWallet()}>
            {wallet ? "Switch wallet" : "Connect wallet"}
          </Button>
          <Button variant="ghost" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </div>
      {workspace === "provider" ? (
        <ProviderConsole
          getToken={getAccessToken}
          parent={parent || "ens402.eth"}
          walletAddress={wallet?.address}
          getProvider={async () => {
            if (!wallet) throw Error("Connect the required signing wallet");
            return wallet.getEthereumProvider();
          }}
        />
      ) : workspace === "merchant" ? (
        <MerchantConsole
          getToken={getAccessToken}
          walletAddress={wallet?.address}
          getProvider={async () => {
            if (!wallet) throw Error("Connect the required signing wallet");
            return wallet.getEthereumProvider();
          }}
        />
      ) : registration ? (
        <RegistrationConsole
          {...registration}
          getToken={getAccessToken}
          walletAddress={wallet?.address}
          getProvider={async () => {
            if (!wallet)
              throw new Error(
                "Connect a wallet using the wallet control at the top of this page.",
              );
            return wallet.getEthereumProvider();
          }}
        />
      ) : (
        <OperatorConsole
          key={user?.id}
          account={{
            id: user!.id,
            walletAddress: wallet?.address,
            getToken: getAccessToken,
            getProvider: async () => {
              if (!wallet)
                throw new Error(
                  "Connect a wallet using the wallet control at the top of this page.",
                );
              return wallet.getEthereumProvider();
            },
          }}
        />
      )}
    </>
  );
}
export function AccountConsole({
  appId,
  registration,
  workspace,
  parent,
}: {
  appId: string;
  workspace?: "provider" | "merchant";
  parent?: string;
  registration?: Registration;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: { theme: "light", accentColor: "#0054cc" },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, sepolia],
      }}
    >
      <AccountWorkspace
        registration={registration}
        workspace={workspace}
        parent={parent}
      />
    </PrivyProvider>
  );
}
