"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  createWalletClient,
  custom,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { serializePaymentRecord } from "@ens402/sdk/ens";
import { ServiceImageField } from "./service-image-field";
import { inspectServiceEndpoint } from "./endpoint-inspection";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { selectedWallet } from "./wallet-session";
import { confirmSetup, setupError, type PendingSetup } from "./setup-flow";
type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
type Settings = Awaited<
  ReturnType<typeof import("@/server/service-settings").readServiceSettings>
>;
const fields = [
  [
    "description",
    "Description",
    "Describe what this API does. Up to 1,024 UTF-8 bytes.",
  ],
  [
    "avatar",
    "Service image",
    "Upload an image or use a public HTTPS image URL.",
  ],
  ["agent-endpoint[x402]", "API endpoint", "The HTTPS address agents call."],
  [
    "ens402.call",
    "Call schema",
    "Input and output metadata published by your endpoint.",
  ],
  [
    "ens402.payment",
    "Payment terms",
    "The price per request must match what your API asks agents to pay.",
  ],
  [
    "ens402.status",
    "Availability",
    "Suspend a listing without transferring its name.",
  ],
] as const;
const field =
  "mt-2 w-full rounded-lg border bg-background p-3 text-sm disabled:bg-muted/40 disabled:text-muted-foreground";
function valuesOf(s: Settings["service"]): Record<string, string> {
  return {
    description: s.description ?? "",
    avatar: s.picture ?? "",
    "agent-endpoint[x402]": s.endpoint,
    "ens402.call": JSON.stringify(s.call, null, 2),
    "ens402.payment": serializePaymentRecord(s.payment),
    "ens402.status": s.status,
  };
}
export function ServiceSettings({
  walletAddress,
  getProvider,
  getToken,
}: {
  walletAddress?: string;
  getProvider: () => Promise<Provider>;
  getToken: () => Promise<string | null>;
}) {
  const [priceText, setPriceText] = useState("");
  const [name, setName] = useState(""),
    [settings, setSettings] = useState<Settings | null>(null),
    [values, setValues] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [prepared, setPrepared] = useState<
      (PendingSetup["step"] & { gas?: string }) | null
    >(null),
    [pending, setPending] = useState<PendingSetup | null>(null);
  const identity = `${name}:${walletAddress?.toLowerCase()}`;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  const storageKey = `ens402-service-update:${name}:${walletAddress?.toLowerCase()}`;
  useEffect(() => {
    setName(new URLSearchParams(location.search).get("name") ?? "");
  }, []);
  async function load(target = name, wallet = walletAddress) {
    if (!target || !wallet) return;
    const identity = `${target}:${wallet.toLowerCase()}`;
    setBusy("load");
    setError("");
    try {
      const r = await fetch(
        `/api/provider/service?${new URLSearchParams({ name: target, wallet })}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (!mounted.current || activeIdentity.current !== identity) return;
      setSettings(data);
      setPriceText(
        data.service.payment.version === 1
          ? ""
          : formatUnits(BigInt(data.service.payment.pricing.amount), 6),
      );
      setValues(valuesOf(data.service));
      setPrepared(null);
    } catch (e) {
      setError(setupError(e));
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    setSettings(null);
    setPrepared(null);
    setPending(null);
    if (!name || !walletAddress) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved?.hash) setPending(saved);
    } catch {}
    void load();
  }, [name, walletAddress]);
  const canWrite = (key: string) =>
    settings?.permissions.some((p) => p.key === key && p.canWrite) ?? false;
  const original = settings ? valuesOf(settings.service) : {};
  const changes = fields
    .filter(([key]) => canWrite(key) && values[key] !== original[key])
    .map(([key]) => ({ key, value: values[key] ?? "" }));
  const [probeState, setProbeState] = useState("");
  const [probing, setProbing] = useState(false);
  const endpoint = values["agent-endpoint[x402]"] ?? "";
  useEffect(() => {
    if (!settings || !endpoint.startsWith("https://") || pending) return;
    const controller = new AbortController();
    setProbing(true);
    const timer = setTimeout(async () => {
      setProbeState("Reading schema from your endpoint…");
      try {
        const call = settings.service.call ?? { method: "GET" };
        const result = await inspectServiceEndpoint(
          endpoint,
          call,
          getToken,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (
          settings.permissions.some(
            (p) => p.key === "ens402.call" && p.canWrite,
          )
        ) {
          setValues((v) => ({
            ...v,
            "ens402.call": JSON.stringify(result.metadata.call, null, 2),
          }));
          setPrepared(null);
        }
        setProbeState(
          "Call schema loaded from the endpoint. Your description, image and price were kept.",
        );
      } catch (e) {
        if (!controller.signal.aborted)
          setProbeState(
            e instanceof Error ? e.message : "Could not inspect endpoint.",
          );
      } finally {
        if (!controller.signal.aborted) setProbing(false);
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setProbing(false);
    };
  }, [endpoint, settings, pending]);
  function displayValue(key: string, value: string) {
    if (!value) return "Not set";
    if (key === "ens402.payment") {
      try {
        const p = JSON.parse(value);
        return `${formatUnits(BigInt(p.pricing.amount), 6)} USDC per request`;
      } catch {}
    }
    return value;
  }
  async function prepare() {
    const started = activeIdentity.current;
    setBusy("prepare");
    setError("");
    setNotice("");
    try {
      if (
        changes.some((c) =>
          [
            "description",
            "agent-endpoint[x402]",
            "ens402.call",
            "ens402.payment",
          ].includes(c.key),
        )
      ) {
        const payment = JSON.parse(values["ens402.payment"]!);
        const check = await fetch("/api/provider/probe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getToken()}`,
          },
          body: JSON.stringify({
            endpoint,
            callConfig: values["ens402.call"],
            description: values.description,
            price: payment.pricing?.amount,
            payTo: settings?.service.payment.payTo,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const result = await check.json();
        if (!check.ok)
          throw Error(
            result.error || "Endpoint does not match these settings.",
          );
      }
      const r = await fetch("/api/provider/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, wallet: walletAddress, changes }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (!mounted.current || activeIdentity.current !== started) return;
      setPrepared(data);
    } catch (e) {
      setError(setupError(e));
    } finally {
      setBusy("");
    }
  }
  async function confirm(saved: PendingSetup) {
    setBusy("confirm");
    const receipt = await confirmSetup(saved);
    if (receipt.status !== "success") {
      localStorage.removeItem(storageKey);
      setPending(null);
      throw Error(
        "The update reverted. Your previous ENS settings remain unchanged.",
      );
    }
    localStorage.removeItem(storageKey);
    setPending(null);
    await load();
    setNotice(
      "Saved on ENS. Search will reflect these changes after finality and the next index refresh.",
    );
  }
  async function submit() {
    const started = activeIdentity.current;
    setError("");
    try {
      if (pending) {
        await confirm(pending);
        return;
      }
      if (!prepared || !walletAddress) return;
      setBusy("wallet");
      const provider = await getProvider();
      await selectedWallet(provider, prepared.signer, "0xaa36a7");
      if (!mounted.current || activeIdentity.current !== started)
        throw Error("Wallet or service changed. Review the update again.");
      const hash = await createWalletClient({
        chain: sepolia,
        transport: custom(provider),
      }).sendTransaction({
        account: prepared.signer as Address,
        to: prepared.to as Address,
        data: prepared.data as Hex,
        value: 0n,
        gas: prepared.gas ? BigInt(prepared.gas) : undefined,
      });
      const saved = { hash, step: prepared };
      localStorage.setItem(storageKey, JSON.stringify(saved));
      setPending(saved);
      setPrepared(null);
      await confirm(saved);
    } catch (e) {
      setError(setupError(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      <Link className="text-sm text-primary" href="/provider">
        ← Your workspaces and services
      </Link>
      <h1 className="mt-5 break-all text-3xl">Service settings</h1>
      <p className="mt-2 break-all text-muted-foreground">
        {name || "Select a service from your workspace."}
      </p>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Editing permissions below are for the wallet selected in the navigation
        bar. Operations edits public details; Treasury Admin edits payment
        terms. Changes require a Sepolia transaction. Keep your API's
        description and payment response aligned with ENS so Guard can verify
        them.
      </p>
      {!walletAddress && (
        <p className="mt-5 text-sm">
          Connect a wallet above to view its editing permissions.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-amber-300 p-4 text-sm"
        >
          {error}
          <Button
            variant="outline"
            className="ml-3"
            disabled={!!busy}
            onClick={() => (pending ? void submit() : void load())}
          >
            {pending ? "Check submitted update" : "Retry loading settings"}
          </Button>
        </div>
      )}
      {busy && (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm">
          <Spinner />
          {busy === "load"
            ? "Reading current ENS settings…"
            : busy === "wallet"
              ? "Confirm the update in your wallet…"
              : busy === "confirm"
                ? "Submitted. Waiting for Sepolia confirmation…"
                : busy === "upload"
                  ? "Uploading image…"
                  : "Checking permissions and simulating changes…"}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-5 rounded-xl border bg-primary/5 p-4 text-sm"
        >
          {notice}
        </p>
      )}
      {settings && (
        <div className="mt-8 space-y-5">
          {fields.map(([key, title, hint]) => (
            <section className="rounded-2xl border bg-card p-6" key={key}>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`setting-${key}`} className="font-semibold">
                  {title}
                </label>
                <span className="text-xs text-muted-foreground">
                  {canWrite(key)
                    ? "Can edit with this wallet"
                    : "Read only for this wallet"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
              {key === "avatar" ? (
                <ServiceImageField
                  value={values[key] ?? ""}
                  getToken={getToken}
                  disabled={!canWrite(key) || !!busy || !!pending}
                  onChange={(url) => {
                    setValues((v) => ({ ...v, avatar: url }));
                    setPrepared(null);
                  }}
                />
              ) : key === "ens402.call" ? (
                <div className="mt-4">
                  <p role="status" className="text-sm text-muted-foreground">
                    {probeState ||
                      "Schema is read from the endpoint automatically."}
                  </p>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      View detected call schema
                    </summary>
                    <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-muted/40 p-4 text-xs">
                      {values[key]}
                    </pre>
                  </details>
                </div>
              ) : key === "agent-endpoint[x402]" ? (
                <input
                  id={`setting-${key}`}
                  type="url"
                  className={field}
                  value={values[key] ?? ""}
                  disabled={!canWrite(key) || !!busy || !!pending}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [key]: e.target.value }));
                    setPrepared(null);
                  }}
                />
              ) : key === "ens402.payment" &&
                settings.service.payment.version !== 1 ? (
                <div className="mt-4">
                  <label className="text-sm">
                    USDC per request
                    <input
                      id={`setting-${key}`}
                      inputMode="decimal"
                      className={field}
                      disabled={!canWrite(key) || !!busy || !!pending}
                      value={priceText}
                      onChange={(e) => {
                        const text = e.target.value;
                        if (!/^\d*(\.\d{0,6})?$/.test(text)) return;
                        setPriceText(text);
                        const payment = JSON.parse(values[key]!);
                        payment.pricing.amount = parseUnits(
                          text || "0",
                          6,
                        ).toString();
                        setValues((v) => ({
                          ...v,
                          [key]: JSON.stringify(payment),
                        }));
                        setPrepared(null);
                      }}
                    />
                  </label>
                  <dl className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div>Network: Base Sepolia · Asset: USDC (6 decimals)</div>
                    <div className="break-all">
                      Recipient: {settings.service.payment.payTo} · follows
                      service ownership
                    </div>
                  </dl>
                </div>
              ) : key === "ens402.status" ? (
                <select
                  id={`setting-${key}`}
                  className={field}
                  disabled={!canWrite(key) || !!busy || !!pending}
                  value={values[key] ?? "active"}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [key]: e.target.value }));
                    setPrepared(null);
                  }}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              ) : (
                <textarea
                  id={`setting-${key}`}
                  className={`${field} ${key === "ens402.payment" ? "min-h-40 font-mono text-xs" : key === "description" ? "min-h-28" : "min-h-16"}`}
                  disabled={!canWrite(key) || !!busy || !!pending}
                  value={values[key] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [key]: e.target.value }));
                    setPrepared(null);
                  }}
                />
              )}
            </section>
          ))}
        </div>
      )}
      <Dialog
        open={!!prepared}
        onOpenChange={(open) => {
          if (!open && !busy) setPrepared(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review service updates</DialogTitle>
            <DialogDescription>
              Check what will change on ENS. These updates use one Sepolia
              transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {changes.map(({ key, value }) => (
              <div key={key} className="rounded-xl border p-4">
                <h3 className="font-medium">
                  {fields.find((f) => f[0] === key)?.[1]}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-lg bg-muted/40 p-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      CURRENT
                    </p>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-sans text-sm">
                      {displayValue(key, original[key] ?? "")}
                    </pre>
                  </div>
                  <div className="min-w-0 rounded-lg bg-primary/5 p-3">
                    <p className="mb-2 text-xs text-primary">AFTER SAVING</p>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-sans text-sm">
                      {displayValue(key, value)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => setPrepared(null)}
            >
              Back to editing
            </Button>
            <Button disabled={!!busy} onClick={() => void submit()}>
              {busy && <Spinner />}
              {busy ? "Waiting for wallet…" : "Confirm in wallet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {settings && (
        <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-sm">
          <p className="text-sm">
            {pending
              ? "Your update was submitted. No new signature is needed."
              : prepared
                ? "Permissions checked. All changes will be submitted in one transaction."
                : `${changes.length} unsaved changes`}
          </p>
          <Button
            disabled={
              !!busy || probing || (!pending && !prepared && !changes.length)
            }
            onClick={() =>
              prepared || pending ? void submit() : void prepare()
            }
          >
            {pending
              ? "Check submitted update"
              : prepared
                ? "Confirm in wallet"
                : "Review changes"}
          </Button>
          {prepared && (
            <Button
              className="ml-3"
              variant="ghost"
              disabled={!!busy}
              onClick={() => setPrepared(null)}
            >
              Back to editing
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
