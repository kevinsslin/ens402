"use client";
import { useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { Button } from "./ui/button";
import { selectedWallet } from "./wallet-session";
import { RegistrationConsole } from "./registration-console";
import type { ProviderSetup } from "@/server/provider-plan";
type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
type Plan = {
  setup: ProviderSetup;
  name: string;
  observedBlock: string;
  ready: boolean;
  transactions: {
    signer: string;
    to?: string;
    data: string;
    description: string;
  }[];
};
const field = "mt-2 w-full rounded-lg border p-3 text-sm";
export function ProviderConsole({
  walletAddress,
  getProvider,
  parent,
  getToken,
}: {
  getToken: () => Promise<string | null>;
  walletAddress?: string;
  getProvider: () => Promise<Provider>;
  parent: string;
}) {
  const [setup, setSetup] = useState<ProviderSetup>({
    parent,
    label: "",
    admin: walletAddress ?? "",
    platformSigner: walletAddress ?? "",
    ops: "",
    treasury: "",
    salt: "",
  });
  const [plan, setPlan] = useState<Plan | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const storageKey = `ens402-provider-setup:${parent}`;
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setSetup(JSON.parse(raw));
      } catch {}
    } else
      setSetup((previous) => ({
        ...previous,
        admin: walletAddress ?? "",
        platformSigner: walletAddress ?? "",
        salt: BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`).toString(),
      }));
    setPlan(null);
  }, [storageKey, walletAddress]);
  function startNew() {
    localStorage.removeItem(storageKey);
    setSetup({
      parent,
      label: "",
      admin: walletAddress ?? "",
      platformSigner: walletAddress ?? "",
      ops: "",
      treasury: "",
      salt: BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`).toString(),
    });
    setPlan(null);
    setMessage(
      "Previous provider setup remains saved by name. Start a new namespace below.",
    );
  }
  async function refresh(current = setup) {
    const response = await fetch("/api/provider/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(current),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Setup unavailable");
    setPlan(result);
    setSetup(result.setup);
    localStorage.setItem(storageKey, JSON.stringify(result.setup));
    localStorage.setItem(
      `ens402-provider:${result.name}`,
      JSON.stringify(result.setup),
    );
  }
  async function run(sign = false) {
    setBusy(true);
    setMessage("");
    try {
      if (!sign) await refresh();
      else {
        const step = plan?.transactions[0];
        if (!step) throw Error("Refresh the plan first");
        const provider = await getProvider();
        const signer = (await selectedWallet(
          provider,
          step.signer,
          "0xaa36a7",
        )) as Address;
        const transport = custom(provider);
        const client = createPublicClient({ chain: sepolia, transport });
        const tx = {
          account: signer,
          ...(step.to ? { to: step.to as Address } : {}),
          data: step.data as Hex,
          value: 0n,
        };
        await client.call(tx);
        const hash = await createWalletClient({
          chain: sepolia,
          transport,
        }).sendTransaction(tx);
        setMessage(`Waiting for ${hash}`);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw Error("Transaction reverted. Refresh before retrying.");
        const next = {
          ...setup,
          ...(!step.to && receipt.contractAddress
            ? { registrar: receipt.contractAddress }
            : {}),
        };
        localStorage.setItem(storageKey, JSON.stringify(next));
        setSetup(next);
        await refresh(next);
        setMessage(
          "Transaction confirmed. Remaining permissions were read again from ENS.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-shell py-12">
      <p className="eyebrow">Provider onboarding</p>
      <h1 className="mt-3 text-4xl">Create your service namespace</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Each step is signed on Sepolia. Provider Admin creates the registry; the
        platform registrar admits the provider name. Connect the requested
        signer for each transaction.
      </p>
      <div className="mt-8 grid gap-4 rounded-2xl border p-6 sm:grid-cols-2">
        {(
          [
            ["label", "Provider label"],
            ["admin", "Provider Admin wallet"],
            ["platformSigner", "Platform registrar wallet"],
            ["ops", "Ops wallet"],
            ["treasury", "Treasury Safe on Sepolia"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm">
            {label}
            <input
              className={field}
              value={setup[key]}
              disabled={busy || !!plan}
              onChange={(event) =>
                setSetup((old) => ({ ...old, [key]: event.target.value }))
              }
            />
          </label>
        ))}
        <p className="self-end text-sm text-muted-foreground">
          {setup.label || "provider"}.{parent}
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        {plan && (
          <Button variant="outline" disabled={busy} onClick={startNew}>
            Start another provider
          </Button>
        )}
        <Button disabled={busy} onClick={() => run()}>
          Read setup status
        </Button>
        {plan?.transactions[0] && (
          <Button
            disabled={
              busy ||
              walletAddress?.toLowerCase() !==
                plan.transactions[0].signer.toLowerCase()
            }
            onClick={() => run(true)}
          >
            Sign next step
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="mt-4 break-all text-sm">
          {message}
        </p>
      )}
      {plan && (
        <div className="mt-6 rounded-xl border p-5">
          <h2 className="font-medium">
            {plan.ready
              ? "Ready to publish services"
              : plan.transactions[0]?.description}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Observed block {plan.observedBlock}
          </p>
          {plan.transactions[0] && (
            <p className="mt-2 break-all text-sm">
              Required signer: {plan.transactions[0].signer}
            </p>
          )}
          <ol className="mt-3 space-y-2 text-sm">
            {plan.transactions.map((step, index) => (
              <li key={index}>
                {index + 1}. {step.description}
              </li>
            ))}
          </ol>
        </div>
      )}
      {plan?.ready && setup.registrar && setup.resolver && (
        <>
          <a
            className="mt-6 inline-block text-primary underline"
            href={`/merchant?provider=${encodeURIComponent(plan.name)}`}
          >
            Open merchant dashboard
          </a>
          <RegistrationConsole
            getToken={getToken}
            registrar={setup.registrar}
            parent={plan.name}
            restricted
            shared={{
              resolver: setup.resolver,
              ops: setup.ops,
              treasury: setup.treasury,
            }}
            walletAddress={walletAddress}
            getProvider={getProvider}
          />
        </>
      )}
    </section>
  );
}
