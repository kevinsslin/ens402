"use client";
import { useState } from "react";
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
export function MerchantHandover({
  name,
  nameRegistry,
  owner,
  registry,
  resolver,
  getProvider,
  onChanged,
}: {
  name: string;
  nameRegistry: string;
  owner: string;
  registry?: string;
  resolver?: string;
  getProvider: () => Promise<Provider>;
  onChanged: () => void;
}) {
  const [incoming, setIncoming] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const scopeUnknown = !!registry && !resolver;
  const key = `ens402-handover:${nameRegistry}:${name}`;
  async function api(action: string, input: unknown, acceptance?: string) {
    const response = await fetch("/api/provider/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, input, acceptance }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    return result;
  }
  async function run(accept: boolean) {
    setBusy(true);
    setNotice("");
    try {
      if (scopeUnknown)
        throw Error(
          "Confirm the shared resolver before transferring provider administration",
        );
      const provider = await getProvider();
      const transport = custom(provider);
      const client = createPublicClient({ chain: sepolia, transport });
      const wallet = createWalletClient({ chain: sepolia, transport });
      if (accept) {
        const input = {
          outgoing: owner,
          incoming,
          nameRegistry,
          label: name.split(".")[0],
          ...(registry ? { registry } : {}),
          ...(resolver ? { resolver } : {}),
          nonce: `0x${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`,
          deadline: Math.floor(Date.now() / 1000) + 86400,
        };
        const result = await api("acceptance-message", input);
        const signer = (await selectedWallet(
          provider,
          incoming,
          "0xaa36a7",
        )) as Address;
        const acceptance = await wallet.signMessage({
          account: signer,
          message: result.message,
        });
        localStorage.setItem(key, JSON.stringify({ input, acceptance }));
        setNotice(
          "Incoming wallet accepted. Connect the outgoing owner and continue the handover.",
        );
      } else {
        const saved = localStorage.getItem(key);
        if (!saved) throw Error("The incoming wallet must accept first");
        const { input, acceptance } = JSON.parse(saved);
        if (
          input.nameRegistry?.toLowerCase() !== nameRegistry.toLowerCase() ||
          input.label !== name.split(".")[0] ||
          input.registry?.toLowerCase() !== registry?.toLowerCase() ||
          input.resolver?.toLowerCase() !== resolver?.toLowerCase()
        )
          throw Error("Saved handover target differs; request new acceptance");
        const result = await api("handover", input, acceptance);
        if (!result.transaction) {
          setNotice(
            `Handover ${result.stage}. Current authority has been verified.`,
          );
          onChanged();
          return;
        }
        const transaction = result.transaction;
        const signer = (await selectedWallet(
          provider,
          transaction.from,
          "0xaa36a7",
        )) as Address;
        const tx = {
          account: signer,
          to: transaction.to as Address,
          data: transaction.data as Hex,
          value: 0n,
        };
        await client.call(tx);
        const hash = await wallet.sendTransaction(tx);
        setNotice(`Waiting for ${hash}`);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw Error("Handover transaction reverted");
        const next = await api("handover", input, acceptance);
        setNotice(
          next.transaction
            ? `Confirmed. Next step: ${next.transaction.purpose}`
            : `Handover ${next.stage}; authority verified.`,
        );
        onChanged();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Handover failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-5 border-t pt-4">
      <summary className="cursor-pointer text-sm">
        {registry
          ? "Transfer provider administration"
          : "Transfer service name ownership"}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {registry
          ? "Moves this provider name, registry governance and selected shared resolver administration. Existing service name owners stay unchanged."
          : resolver
            ? "Moves the service name and dedicated resolver administration. Holder-derived payment recipients follow the new owner."
            : "Moves the service name only. Shared provider resolver administration stays with the provider. Holder-derived payment recipients follow the new owner."}{" "}
        Incoming acceptance is required. Each outgoing transaction is simulated
        and checked after confirmation.
      </p>
      {scopeUnknown && (
        <p role="alert" className="mt-3 text-sm">
          Shared resolver scope is unknown. Enter and verify the provider shared
          resolver above before beginning a complete provider handover.
        </p>
      )}
      <label className="mt-3 block text-sm">
        Incoming owner
        <input
          value={incoming}
          onChange={(e) => setIncoming(e.target.value)}
          className="mt-1 w-full rounded border p-2"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || scopeUnknown}
          onClick={() => run(true)}
        >
          Accept with incoming wallet
        </Button>
        <Button disabled={busy || scopeUnknown} onClick={() => run(false)}>
          Continue handover
        </Button>
      </div>
      {notice && (
        <p role="status" className="mt-3 break-all text-xs">
          {notice}
        </p>
      )}
    </details>
  );
}
