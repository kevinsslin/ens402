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
    "Fixed price in token atomic units. USDC uses 6 decimals: 10000 = 0.01 USDC.",
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
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
  async function prepare() {
    const started = activeIdentity.current;
    setBusy("prepare");
    setError("");
    setNotice("");
    try {
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
  async function upload(file: File) {
    const started = activeIdentity.current;
    setBusy("upload");
    setError("");
    try {
      if (file.size > 1024 * 1024)
        throw Error("Choose an image no larger than 1 MB.");
      const token = await getToken();
      if (!token) throw Error("Sign in to upload an image.");
      const r = await fetch("/api/service-images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type,
        },
        body: file,
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (!mounted.current || activeIdentity.current !== started) return;
      setValues((v) => ({ ...v, avatar: data.url }));
      setPrepared(null);
      setNotice("Image uploaded. Save changes to publish its URL on ENS.");
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
        These are your current ENS records. Operations edits public details;
        Treasury Admin edits payment terms. Changes require a Sepolia
        transaction. Keep your API's description and payment response aligned
        with ENS so Guard can verify them.
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
                  {canWrite(key) ? "Can edit" : "Read only"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
              {key === "avatar" && values[key] && (
                <img
                  src={values[key]}
                  referrerPolicy="no-referrer"
                  alt="Current service image preview"
                  className="mt-4 size-24 rounded-xl border object-cover"
                />
              )}
              {key === "ens402.payment" &&
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
                  className={`${field} ${key === "ens402.call" || key === "ens402.payment" ? "min-h-40 font-mono text-xs" : key === "description" ? "min-h-28" : "min-h-16"}`}
                  disabled={!canWrite(key) || !!busy || !!pending}
                  value={values[key] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [key]: e.target.value }));
                    setPrepared(null);
                  }}
                />
              )}
              {key === "avatar" && canWrite(key) && (
                <label className="mt-3 block text-sm">
                  Upload PNG, JPEG or WebP · max 1 MB
                  <input
                    aria-label="Upload service image"
                    className="mt-2 block text-sm"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!!busy || !!pending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </section>
          ))}
        </div>
      )}
      {settings && (
        <div className="sticky bottom-4 mt-6 rounded-xl border bg-background p-4 shadow-sm">
          <p className="mb-3 text-sm">
            {pending
              ? "Your update was submitted. No new signature is needed."
              : prepared
                ? "Permissions checked. All changes will be submitted in one transaction."
                : `${changes.length} unsaved changes`}
          </p>
          <Button
            disabled={!!busy || (!pending && !prepared && !changes.length)}
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
