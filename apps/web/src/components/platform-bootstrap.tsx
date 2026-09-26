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

type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
type Setup = {
  parent: string;
  salt: string;
  registry?: string;
  owner?: string;
  deploymentHash?: string;
};
type Plan = {
  stage: "deploy" | "link" | "complete";
  setup: Setup;
  name: string;
  owner: string;
  observedBlock: string;
  ready: boolean;
  transactions: Array<{
    signer: string;
    to: string;
    data: string;
    value?: string;
    description: string;
  }>;
};

/** Owner-signed platform setup. A saved plan is never evidence of current authority. */
export function PlatformBootstrap({
  parent,
  walletAddress,
  getProvider,
}: {
  parent: string;
  walletAddress?: string;
  getProvider: () => Promise<Provider>;
}) {
  const key = `ens402-platform-setup:${parent}`;
  const [setup, setSetup] = useState<Setup>({ parent, salt: "" });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const saved = localStorage.getItem(key);
    try {
      if (saved) {
        const value = JSON.parse(saved);
        if (value.parent === parent) {
          setSetup(value);
          return;
        }
      }
    } catch {}
    setSetup({
      parent,
      salt: BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`).toString(),
    });
    setPlan(null);
  }, [key, parent]);
  async function refresh(current = setup) {
    const response = await fetch("/api/provider/platform-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, owner: walletAddress }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Platform setup unavailable");
    const next = result as Plan;
    setPlan(next);
    setSetup(next.setup);
    localStorage.setItem(key, JSON.stringify(next.setup));
    return next;
  }
  async function run(sign: boolean) {
    setBusy(true);
    setNotice("");
    try {
      // Re-read ownership and pointer state before asking for a signature.
      const current = await refresh();
      if (!sign) return;
      const step = current.transactions[0];
      if (!step) {
        setNotice("The platform registry is already configured and verified.");
        return;
      }
      const provider = await getProvider();
      const account = (await selectedWallet(
        provider,
        step.signer,
        "0xaa36a7",
      )) as Address;
      const transport = custom(provider);
      const client = createPublicClient({ chain: sepolia, transport });
      const transaction = {
        account,
        to: step.to as Address,
        data: step.data as Hex,
        value: BigInt(step.value ?? "0"),
      };
      await client.call(transaction);
      const hash = await createWalletClient({
        chain: sepolia,
        transport,
      }).sendTransaction(transaction);
      const submitted = {
        ...current.setup,
        ...(current.stage === "deploy" ? { deploymentHash: hash } : {}),
      };
      setSetup(submitted);
      localStorage.setItem(key, JSON.stringify(submitted));
      setNotice(`Waiting for Sepolia confirmation: ${hash}`);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        if (current.stage === "deploy") {
          const retry = { ...current.setup, deploymentHash: undefined };
          setSetup(retry);
          localStorage.setItem(key, JSON.stringify(retry));
        }
        throw Error(
          "Transaction reverted. Read the platform state before retrying.",
        );
      }
      const next = await refresh(submitted);
      setNotice(
        next.ready
          ? "Registry link and native authority verified on Sepolia. Continue with provider setup below."
          : `Confirmed. Next: ${next.transactions[0]?.description ?? "read current state"}`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Platform setup failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-8 rounded-2xl border bg-card p-6">
      <summary className="cursor-pointer font-medium">
        Platform owner setup: {parent}
      </summary>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Initialize the platform once, before admitting provider names. Deploying
        a registry and linking it to the ENS name are separate owner-signed
        transactions. A saved setup never proves permissions.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy || !setup.salt || !walletAddress}
          onClick={() => run(false)}
        >
          Read Sepolia setup
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
            Sign next setup step
          </Button>
        )}
      </div>
      {plan && (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            {plan.ready ? "Platform verified" : "Platform setup incomplete"} ·
            Sepolia block {plan.observedBlock}
          </p>
          <p className="break-all">Current ENS owner: {plan.setup.owner}</p>
          {plan.setup.registry && (
            <p className="break-all">
              Platform registry: {plan.setup.registry}
            </p>
          )}
          {plan.transactions[0] && (
            <p className="break-all">
              Required signer: {plan.transactions[0].signer}
            </p>
          )}
          <ol className="list-decimal space-y-2 pl-5">
            {plan.transactions.map((step, index) => (
              <li key={index}>{step.description}</li>
            ))}
          </ol>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-4 break-words text-sm">
          {notice}
        </p>
      )}
    </details>
  );
}
