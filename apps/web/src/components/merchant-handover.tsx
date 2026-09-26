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
import { CheckCircle2 } from "lucide-react";
import { Spinner } from "./ui/spinner";
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
  const [accepted, setAccepted] = useState(false);
  const [finished, setFinished] = useState(false);
  const scopeUnknown = !!registry && !resolver;
  const key = `ens402-handover:${nameRegistry}:${name}`;
  useEffect(() => {
    setAccepted(false);
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (
        saved?.acceptance &&
        saved.input?.deadline > Date.now() / 1000 &&
        saved.input.nameRegistry?.toLowerCase() ===
          nameRegistry.toLowerCase() &&
        saved.input.label === name.split(".")[0] &&
        saved.input.registry?.toLowerCase() === registry?.toLowerCase() &&
        saved.input.resolver?.toLowerCase() === resolver?.toLowerCase()
      ) {
        setIncoming(saved.input.incoming);
        setAccepted(true);
      }
    } catch {}
  }, [key, name, nameRegistry, registry, resolver]);
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
        setAccepted(true);
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
          setFinished(true);
          localStorage.removeItem(key);
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
        if (!next.transaction) {
          setFinished(true);
          localStorage.removeItem(key);
        }
        onChanged();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Handover failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-amber-200 bg-card p-5">
      <h3 className="font-sans text-lg font-semibold">
        {registry
          ? "Transfer provider administration"
          : "Transfer service name ownership"}
      </h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {registry
          ? "Moves this provider name, registry governance and selected shared resolver administration. Existing service name owners stay unchanged."
          : resolver
            ? "Moves the service name and dedicated resolver administration. Holder-derived payment recipients follow the new owner."
            : "Moves the service name only. Shared provider resolver administration stays with the provider. Holder-derived payment recipients follow the new owner."}{" "}
        The new owner first signs consent without gas. Then the current
        administrator submits the on-chain transfer. Provider transfers may
        require several transactions.
      </p>
      {scopeUnknown && (
        <p role="alert" className="mt-3 text-sm">
          Shared resolver scope is unknown. Enter and verify the provider shared
          resolver above before beginning a complete provider handover.
        </p>
      )}
      <label className="mt-3 block text-sm">
        New owner wallet
        <input
          value={incoming}
          disabled={busy || finished}
          placeholder="0x…"
          onChange={(e) => {
            setIncoming(e.target.value);
            setAccepted(false);
            localStorage.removeItem(key);
          }}
          className="mt-1 w-full rounded border p-2"
        />
      </label>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        <li className="rounded-xl border bg-background p-4">
          <h4 className="flex items-center gap-2 font-medium">
            {accepted && <CheckCircle2 className="size-4 text-primary" />}1. New
            owner agrees
          </h4>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect the new owner wallet and sign consent. This is a message
            signature, with no gas fee.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            disabled={
              busy ||
              scopeUnknown ||
              accepted ||
              finished ||
              !/^0x[0-9a-fA-F]{40}$/.test(incoming)
            }
            onClick={() => run(true)}
          >
            {accepted ? "Consent signed" : "Sign as new owner"}
          </Button>
        </li>
        <li className="rounded-xl border bg-background p-4">
          <h4 className="flex items-center gap-2 font-medium">
            {finished && <CheckCircle2 className="size-4 text-primary" />}2.
            Current admin transfers
          </h4>
          <p className="mt-2 text-sm text-muted-foreground">
            Switch back to the current administrator wallet to confirm the
            transfer on Sepolia. Gas is required.
          </p>
          <Button
            className="mt-4"
            disabled={busy || scopeUnknown || !accepted || finished}
            onClick={() => run(false)}
          >
            {finished ? "Transfer complete" : "Confirm transfer as admin"}
          </Button>
        </li>
      </ol>
      {busy && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm">
          <Spinner />
          Processing the current step…
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 break-all text-xs">
          {notice}
        </p>
      )}
    </section>
  );
}
