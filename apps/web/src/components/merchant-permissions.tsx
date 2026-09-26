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
type Transaction = { from: string; to: string; data: string; purpose: string };
export function MerchantPermissions({
  name,
  resolver,
  nameRegistry,
  walletAddress,
  getProvider,
  onChanged,
}: {
  name: string;
  resolver: string;
  nameRegistry: string;
  walletAddress?: string;
  getProvider: () => Promise<Provider>;
  onChanged: () => void;
}) {
  const [role, setRole] = useState("ops"),
    [outgoing, setOutgoing] = useState(""),
    [incoming, setIncoming] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function api(action: string, input: unknown) {
    const response = await fetch("/api/provider/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, input }),
    });
    const value = await response.json();
    if (!response.ok) throw Error(value.error);
    return value;
  }
  async function rotate() {
    setBusy(true);
    setNotice("");
    try {
      const input = {
        name,
        resolver,
        admin: walletAddress,
        outgoing,
        incoming,
        role,
      };
      const prepared = await api("rotate", input);
      const transaction = prepared.transaction as Transaction;
      const provider = await getProvider();
      const signer = (await selectedWallet(
        provider,
        transaction.from,
        "0xaa36a7",
      )) as Address;
      const transport = custom(provider);
      const client = createPublicClient({ chain: sepolia, transport });
      const tx = {
        account: signer,
        to: transaction.to as Address,
        data: transaction.data as Hex,
        value: 0n,
      };
      await client.call(tx);
      const hash = await createWalletClient({
        chain: sepolia,
        transport,
      }).sendTransaction(tx);
      setNotice(`Waiting for ${hash}`);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Error("Rotation reverted");
      const verification = await api("verify-rotation", input);
      if (verification.passed !== true) {
        const failed = (verification.checks ?? [])
          .filter((check: { passed: boolean }) => !check.passed)
          .map(
            (check: { account: string; key: string }) =>
              `${check.account}: ${check.key}`,
          )
          .join(", ");
        throw Error(
          `Transaction confirmed, but permission verification failed${failed ? `: ${failed}` : ""}. Refresh permissions before retrying.`,
        );
      }
      setNotice(
        "Replacement confirmed and native permissions verified. All services sharing this resolver are affected.",
      );
      onChanged();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Rotation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mt-5 border-t pt-4">
      <summary className="cursor-pointer text-sm">
        Replace shared provider delegate
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        This changes key permissions across every service using this resolver.
        It does not change payment recipients. Native Admin authority is
        required.
      </p>
      <label className="mt-3 block text-sm">
        Delegate
        <select
          className="mt-1 w-full rounded border p-2"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="ops">Ops</option>
          <option value="treasury">Treasury Admin</option>
        </select>
      </label>
      <label className="mt-3 block text-sm">
        Current wallet
        <input
          className="mt-1 w-full rounded border p-2"
          value={outgoing}
          onChange={(e) => setOutgoing(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-sm">
        Replacement wallet
        <input
          className="mt-1 w-full rounded border p-2"
          value={incoming}
          onChange={(e) => setIncoming(e.target.value)}
        />
      </label>
      <Button
        className="mt-4"
        disabled={busy || !walletAddress}
        onClick={rotate}
      >
        Verify and replace
      </Button>
      {notice && (
        <p role="status" className="mt-3 break-all text-xs">
          {notice}
        </p>
      )}
    </details>
  );
}
