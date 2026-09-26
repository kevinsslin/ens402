"use client";
import { useEffect, useState } from "react";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { confirmSetup, setupError, type PendingSetup } from "./setup-flow";
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
    gas?: string;
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
  const [pending, setPending] = useState<
    (PendingSetup & { setup: Setup }) | null
  >(null);
  useEffect(() => {
    const saved = localStorage.getItem(key);
    try {
      setPending(
        JSON.parse(localStorage.getItem(`${key}:transaction`) || "null"),
      );
    } catch {}
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
  async function refresh(current = setup, prepare = false) {
    const response = await fetch("/api/provider/platform-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, owner: walletAddress, prepare }),
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
      if (pending) {
        setNotice(
          "Checking your saved transaction. No new signature is needed.",
        );
        const receipt = await confirmSetup(pending);
        if (receipt.status === "reverted") {
          localStorage.removeItem(`${key}:transaction`);
          setPending(null);
          if (pending.setup.deploymentHash) {
            const retry = { ...pending.setup, deploymentHash: undefined };
            localStorage.setItem(key, JSON.stringify(retry));
            setSetup(retry);
          }
          throw Error(
            "Transaction reverted. Your setup is saved; try this step again.",
          );
        }
        setSetup(pending.setup);
        localStorage.setItem(key, JSON.stringify(pending.setup));
        localStorage.removeItem(`${key}:transaction`);
        setPending(null);
        await refresh(pending.setup);
        setNotice(
          "Transaction confirmed. Continue with the next step shown below.",
        );
        return;
      }
      const current = await refresh(setup, sign);
      if (!sign) return;
      const step = current.transactions[0];
      if (!step) {
        setNotice("The platform registry is configured and verified.");
        return;
      }
      if (!step.gas) throw Error("Transaction preparation is incomplete");
      const provider = await getProvider();
      const account = (await selectedWallet(
        provider,
        step.signer,
        "0xaa36a7",
      )) as Address;
      setNotice("Confirm this transaction in your wallet.");
      const hash = await createWalletClient({
        chain: sepolia,
        transport: custom(provider),
      }).sendTransaction({
        account,
        to: step.to as Address,
        data: step.data as Hex,
        value: BigInt(step.value ?? "0"),
        gas: BigInt(step.gas),
      });
      const submitted = {
        ...current.setup,
        ...(current.stage === "deploy" ? { deploymentHash: hash } : {}),
      };
      const transaction = { hash, step, setup: submitted };
      localStorage.setItem(`${key}:transaction`, JSON.stringify(transaction));
      setPending(transaction);
      setSetup(submitted);
      localStorage.setItem(key, JSON.stringify(submitted));
      setNotice("Submitted. Waiting for confirmation on Sepolia.");
      const receipt = await confirmSetup(transaction);
      if (receipt.status === "reverted") {
        localStorage.removeItem(`${key}:transaction`);
        setPending(null);
        const retry = { ...current.setup, deploymentHash: undefined };
        localStorage.setItem(key, JSON.stringify(retry));
        setSetup(retry);
        throw Error(
          "Transaction reverted. Review this step before trying again.",
        );
      }
      localStorage.removeItem(`${key}:transaction`);
      setPending(null);
      const next = await refresh(submitted);
      setNotice(
        next.ready
          ? "Registry link and native authority verified on Sepolia. Continue with provider setup below."
          : `Confirmed. Next: ${next.transactions[0]?.description ?? "read current state"}`,
      );
    } catch (error) {
      setNotice(setupError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Platform initialization" className="mt-8 rounded-2xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-medium">
        {plan?.ready && <CheckCircle2 className="size-5 text-primary" />}
        {plan?.ready ? "Platform ready" : `Initialize platform: ${parent}`}
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        {plan?.ready
          ? "Your platform is configured. Continue with provider setup below."
          : "One-time setup for the platform owner: create the directory, then connect it to your ENS name."}
      </p>
      {!plan?.ready && <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy || !setup.salt || !walletAddress}
          onClick={() => run(false)}
        >
          {pending ? "Check transaction" : "Check platform setup"}
        </Button>
        {!pending && plan?.transactions[0] && (
          <Button
            disabled={
              busy ||
              walletAddress?.toLowerCase() !==
                plan.transactions[0].signer.toLowerCase()
            }
            onClick={() => run(true)}
          >
            {plan.stage === "deploy"
              ? "Create platform directory"
              : "Connect directory to ENS"}
          </Button>
        )}
      </div>}
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
    </section>
  );
}
