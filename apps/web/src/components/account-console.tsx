"use client";
import { useActiveWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { Fragment } from "react";
import { activeEthereumWallet } from "./active-wallet";
import { Button } from "@/components/ui/button";
import { RegistrationConsole } from "./registration-console";
import { ProviderConsole } from "./provider-console";
import { MerchantConsole } from "./merchant-console";
import { DiscoveryConsole } from "./discovery-console";
import { ServiceSettings } from "./service-settings";
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
  workspace?: "provider" | "merchant" | "service";
  parent?: string;
}) {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { wallet: activeWallet } = useActiveWallet();
  const wallet = activeEthereumWallet(wallets, activeWallet?.address);
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
    <Fragment key={wallet?.address.toLowerCase() ?? "no-wallet"}>
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
      ) : workspace === "service" ? (
        <ServiceSettings
          walletAddress={wallet?.address}
          getToken={getAccessToken}
          getProvider={async () => {
            if (!wallet) throw Error("Connect a wallet to update settings");
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
    </Fragment>
  );
}
export function AccountConsole({
  appId,
  registration,
  workspace,
  parent,
}: {
  appId: string;
  workspace?: "provider" | "merchant" | "service";
  parent?: string;
  registration?: Registration;
}) {
  return (
    <AccountWorkspace
      registration={registration}
      workspace={workspace}
      parent={parent}
    />
  );
}
