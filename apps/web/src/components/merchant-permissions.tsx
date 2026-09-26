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
import { Spinner } from "./ui/spinner";
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
  canManage = true,
}: {
  name: string;
  resolver: string;
  nameRegistry: string;
  walletAddress?: string;
  getProvider: () => Promise<Provider>;
  onChanged: () => void;
  canManage?: boolean;
}) {
  const [role, setRole] = useState("ops"),
    [selectedOutgoing, setSelectedOutgoing] = useState(""),
    [incoming, setIncoming] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [assignments, setAssignments] = useState<{
    ops: string[];
    treasury: string[];
    admins: string[];
    observedBlock: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAssignments(null);
    setLoadError("");
    setSelectedOutgoing("");
    api("delegates", { resolver })
      .then((value) => {
        if (active) setAssignments(value);
      })
      .catch((error) => {
        if (active)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to read current roles",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resolver, revision]);
  const holders = assignments?.[role as "ops" | "treasury"] ?? [];
  const outgoing =
    holders.length === 1
      ? holders[0]!
      : holders.includes(selectedOutgoing)
        ? selectedOutgoing
        : "";
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
      setIncoming("");
      setRevision((value) => value + 1);
      onChanged();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Rotation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <div>
        <h3 className="font-sans text-lg font-semibold">
          Provider permissions
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          These native permissions apply to every service using this resolver.
          Replacing a delegate does not change the payment recipient.
        </p>
      </div>
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner />
          Reading current ENS permissions…
        </p>
      ) : loadError ? (
        <div role="alert" className="rounded-lg border p-4 text-sm">
          <p>{loadError}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry permission check
          </Button>
        </div>
      ) : (
        assignments && (
          <>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Resolver Admin
              </p>
              {assignments.admins.map((address) => (
                <p className="mt-2 break-all font-mono text-xs" key={address}>
                  {address}
                </p>
              ))}
              {assignments.admins.length === 0 && (
                <p className="mt-2 text-sm">
                  No root text administrator found.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Can manage text permissions. This is separate from service-name
                ownership.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["ops", "treasury"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  disabled={busy}
                  aria-pressed={role === item}
                  className={`rounded-xl border p-4 text-left ${role === item ? "border-primary bg-primary/5" : "bg-card"}`}
                  onClick={() => {
                    setRole(item);
                    setSelectedOutgoing("");
                    setIncoming("");
                    setNotice("");
                  }}
                >
                  <span className="font-medium">
                    {item === "ops" ? "Operations" : "Treasury Admin"}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                    {item === "ops"
                      ? "Endpoint, description, image and call schema"
                      : "Price and payment configuration"}
                  </span>
                  {assignments[item].map((address) => (
                    <span
                      key={address}
                      className="mt-3 block break-all font-mono text-xs"
                    >
                      {address}
                    </span>
                  ))}
                  {assignments[item].length === 0 && (
                    <span className="mt-3 block text-xs">
                      No dedicated writer found
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Verified on Sepolia at block {assignments.observedBlock}. Broad
              administrators and publisher contracts are not treated as
              dedicated delegates.
            </p>
            {canManage ? (
              <div className="rounded-xl border p-5">
                <h4 className="font-semibold">
                  Replace {role === "ops" ? "Operations" : "Treasury Admin"}
                </h4>
                <label className="mt-4 block text-sm">
                  Current wallet
                  {holders.length > 1 ? (
                    <select
                      className="mt-2 w-full rounded-md border bg-background p-3 font-mono text-xs"
                      value={outgoing}
                      disabled={busy}
                      onChange={(e) => setSelectedOutgoing(e.target.value)}
                    >
                      <option value="">
                        Select an existing on-chain holder
                      </option>
                      {holders.map((address) => (
                        <option key={address} value={address}>
                          {address}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label="Current wallet"
                      readOnly
                      className="mt-2 w-full rounded-md border bg-muted/40 p-3 font-mono text-xs"
                      value={outgoing}
                      placeholder="No verified holder"
                    />
                  )}
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Read from ENS. You cannot enter an arbitrary current wallet.
                </p>
                <label className="mt-4 block text-sm">
                  New wallet
                  <input
                    className="mt-2 w-full rounded-md border bg-background p-3 font-mono text-xs"
                    placeholder="0x…"
                    value={incoming}
                    disabled={busy}
                    onChange={(e) => setIncoming(e.target.value)}
                  />
                </label>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  One transaction grants the new wallet access and revokes the
                  current wallet's selected permissions. EOA, MPC and multisig
                  wallets are supported.
                </p>
                <Button
                  className="mt-4"
                  disabled={
                    busy ||
                    !walletAddress ||
                    !outgoing ||
                    !/^0x[0-9a-fA-F]{40}$/.test(incoming)
                  }
                  onClick={rotate}
                >
                  {busy && <Spinner className="mr-2" />}Review and replace
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect a Resolver Admin wallet to change these permissions.
              </p>
            )}
          </>
        )
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-4 text-sm break-words">
          {notice}
        </p>
      )}
    </section>
  );
}
