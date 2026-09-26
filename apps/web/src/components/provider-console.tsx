"use client";
import Link from "next/link";
import { ArrowRight, Building2, Plus, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createWalletClient,
  custom,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { Button } from "./ui/button";
import { confirmSetup, setupError, setupStepCopy, type PendingSetup } from "./setup-flow";
import { SetupProgressCard, type SetupActivity } from "./setup-progress-card";
import { selectedWallet } from "./wallet-session";
import { PlatformBootstrap } from "./platform-bootstrap";
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
  phase: number;
  hasConfirmedSetup: boolean;
  transactions: {
    signer: string;
    to?: string;
    data: string;
    description: string;
    gas?: string;
  }[];
};
type PendingProvider = PendingSetup & { setup: ProviderSetup; phase: number };
type Directory = Awaited<ReturnType<typeof import("@/server/provider-directory").providerDirectory>>;
const field = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-muted-foreground";
const walletFields = [
  { key: "admin", title: "Provider Admin", hint: "Owns the provider name, manages service registration and grants or replaces wallet permissions. Also retains full text control of the shared resolver.", note: "Use a wallet you control." },
  { key: "ops", title: "Operations wallet", hint: "Updates descriptions, images, API endpoints and call schemas across your services. Cannot change payment terms.", note: "A separate hot wallet or agent wallet." },
  { key: "treasury", title: "Treasury Admin", hint: "Updates payment terms across your services. Each service's name holder is its payment recipient.", note: "An EOA, multisig or MPC wallet, separate from Provider Admin and Operations." },
] as const;
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
  const [pending, setPending] = useState<PendingProvider | null>(null);
  const [activity, setActivity] = useState<SetupActivity>("idle");
  const [failed, setFailed] = useState(false);
  const hasSetupProgress = Boolean(plan || pending);
  useEffect(() => {
    if (hasSetupProgress) document.getElementById("provider-setup-progress")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasSetupProgress]);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryVersion, setDirectoryVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setDirectory(null); setDirectoryError(""); setDirectoryLoading(true); setCreating(false);
    if (!walletAddress) { setDirectoryLoading(false); return; }
    fetch(`/api/provider/directory?wallet=${encodeURIComponent(walletAddress)}`, { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error); return data as Directory; })
      .then(data => {
        if (controller.signal.aborted) return;
        setDirectory(data);
        setSetup(previous => ({ ...previous, platformSigner: previous.platformSigner === walletAddress || !previous.platformSigner ? data.platformOwner : previous.platformSigner }));
      })
      .catch(error => { if (!controller.signal.aborted) setDirectoryError(error instanceof Error ? error.message : "Provider lookup unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setDirectoryLoading(false); });
    return () => controller.abort();
  }, [walletAddress, directoryVersion]);
  const storageKey = `ens402-provider-setup:${parent}`;
  const pendingKey = `${storageKey}:transaction`;
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    try {
      const saved = JSON.parse(localStorage.getItem(pendingKey) || "null") as PendingProvider | null;
      setPending(saved?.setup?.parent === parent && /^0x[0-9a-fA-F]{64}$/.test(saved.hash) ? saved : null);
    } catch { setPending(null); }
    if (raw) {
      try {
        const saved = JSON.parse(raw) as ProviderSetup;
        const associated = [saved.admin, saved.platformSigner, saved.ops, saved.treasury].some(value => value?.toLowerCase() === walletAddress?.toLowerCase());
        if (saved.parent === parent && associated) { setSetup(saved); setCreating(!saved.registrar); }
        else setSetup({ parent, label: "", admin: walletAddress ?? "", platformSigner: "", ops: "", treasury: "", salt: BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`).toString() });
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
    setCreating(true);
    localStorage.removeItem(storageKey);
    setSetup({
      parent,
      label: "",
      admin: walletAddress ?? "",
      platformSigner: directory?.platformOwner ?? walletAddress ?? "",
      ops: "",
      treasury: "",
      salt: BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`).toString(),
    });
    setPlan(null);
    setMessage(
      "Previous provider setup remains saved by name. Start a new namespace below.",
    );
  }
  async function refresh(current = setup, prepare = false) {
    const response = await fetch("/api/provider/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...current, prepare }),
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
    return result as Plan;
  }
  async function finishTransaction(transaction: PendingProvider) {
    setActivity("confirming");
    setMessage("Waiting for Sepolia confirmation. You can leave this page and return later.");
    const receipt = await confirmSetup(transaction);
    if (receipt.status === "reverted") {
      localStorage.removeItem(pendingKey); setPending(null);
      throw Error("The transaction reverted. Your setup is saved. Review and try this step again.");
    }
    const next = { ...transaction.setup, ...(!transaction.step.to && receipt.contractAddress ? { registrar: receipt.contractAddress } : {}) };
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSetup(next);
    localStorage.removeItem(pendingKey); setPending(null);
    setActivity("checking");
    await refresh(next);
    setMessage("Confirmed. Your next setup step is ready below.");
  }
  async function run(sign = false) {
    if (busy) return;
    setBusy(true); setMessage(""); setFailed(false); setActivity("checking");
    try {
      if (pending) { await finishTransaction(pending); return; }
      if (!sign) { await refresh(); return; }
      const current = await refresh(setup, true);
      const step = current.transactions[0];
      if (!step) { setMessage("Setup is complete. You can publish your first service."); return; }
      if (!step.gas) throw Error("Transaction preparation is incomplete. Review the setup again.");
      const provider = await getProvider();
      const signer = (await selectedWallet(provider, step.signer, "0xaa36a7")) as Address;
      setActivity("wallet");
      setMessage("Confirm the transaction in your wallet. We will save its hash as soon as the wallet returns it.");
      // Wallet submission is intentionally never retried automatically.
      const hash = await createWalletClient({ chain: sepolia, transport: custom(provider) }).sendTransaction({
        account: signer, ...(step.to ? { to: step.to as Address } : {}), data: step.data as Hex, value: 0n, gas: BigInt(step.gas),
      });
      const submitted = { hash, step, setup: current.setup, phase: current.phase };
      localStorage.setItem(pendingKey, JSON.stringify(submitted)); setPending(submitted);
      await finishTransaction(submitted);
    } catch (error) { setFailed(true); setMessage(setupError(error)); }
    finally { setBusy(false); setActivity("idle"); }
  }
  const nextStep = setupStepCopy(plan?.transactions[0]?.description);
  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8">
      <p className="eyebrow">Onboard your service</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-5xl">Your service workspace</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">Manage your providers, or create a home for your APIs on ENS.</p>
        </div>
        {directory && directory.providers.length > 0 && <Button variant="outline" disabled={busy || !!pending || (!!plan && !plan.ready)} onClick={startNew}><Plus className="mr-2 size-4" />Create provider</Button>}
      </div>
      {!walletAddress && <p className="mt-8 text-sm text-muted-foreground">Connect a wallet above to find your providers or create one.</p>}
      {directoryLoading && <p role="status" className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Checking your providers on Sepolia…</p>}
      {directoryError && <div role="alert" className="mt-6 rounded-xl border bg-slate-50 p-5 text-sm"><p>{directoryError}</p><div className="mt-3 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setDirectoryVersion(value => value + 1)}>Retry</Button><Button asChild variant="outline"><Link href="/merchant">Open a known provider</Link></Button><Button variant="ghost" onClick={() => setCreating(true)}>Create a provider</Button></div></div>}
      {directory && directory.providers.length > 0 && <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {directory.providers.map(provider => <article key={provider.name} className="rounded-2xl border bg-white p-6">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Building2 className="size-5" /></div><span className="text-xs font-medium text-primary">{provider.role}</span></div>
          <h2 className="mt-4 break-all text-xl">{provider.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Manage service listings, settings and permissions.</p>
          <Button asChild className="mt-5"><Link href={`/merchant?provider=${encodeURIComponent(provider.name)}`}>Manage provider <ArrowRight className="ml-2 size-4" /></Link></Button>
          {`${setup.label}.${setup.parent}` === provider.name && <Button variant="ghost" className="mt-5 ml-2" disabled={busy} onClick={() => { setCreating(true); void run(); }}>Continue setup</Button>}
        </article>)}
      </div>}
      {directory && <p className="mt-4 text-xs text-muted-foreground">Providers you own or can register services under. Have an Operations or Treasury Admin role? <Link href="/merchant" className="text-primary underline underline-offset-4">Open your provider by name.</Link></p>}
      {directory?.platformOwner.toLowerCase() === walletAddress?.toLowerCase() && <PlatformBootstrap parent={parent} walletAddress={walletAddress} getProvider={getProvider} />}
      {(creating || pending || (directory && directory.providers.length === 0)) && <>
      <ol aria-label="Onboarding progress" className="mt-8 grid grid-cols-3 gap-2 text-sm">
        {["Your details", "Set up on Sepolia", "Publish a service"].map((label, index) => <li key={label} aria-current={index === (plan?.ready ? 2 : plan || pending ? 1 : 0) ? "step" : undefined} className={`rounded-xl border px-3 py-3 ${index === (plan?.ready ? 2 : plan || pending ? 1 : 0) ? "border-primary/30 bg-primary/5 font-medium text-primary" : "text-muted-foreground"}`}><span className="mr-2">{index + 1}.</span>{label}</li>)}
      </ol>
      <details open={!plan && !pending} className="mt-5 rounded-2xl border bg-white">
      <summary className="cursor-pointer px-6 py-4 text-sm font-medium">Provider details{setup.label ? `: ${setup.label}.${parent}` : ""}</summary>
      <form onSubmit={event => { event.preventDefault(); void run(); }} className="overflow-hidden rounded-b-2xl bg-white">
        <div className="border-b bg-slate-50/70 px-6 py-5 sm:px-8">
          <h2 className="text-2xl">Create a provider</h2>
          <p className="mt-2 text-sm text-muted-foreground">A provider groups your services under one ENS name and one set of management wallets.</p>
        </div>
        <div className="space-y-8 p-6 sm:p-8">
          <fieldset disabled={busy || !!plan || !!pending}>
            <legend className="flex items-center gap-2 font-medium"><Building2 className="size-4 text-primary" />1. Choose your name</legend>
            <label htmlFor="provider-label" className="mt-4 block text-sm font-medium">Provider name</label>
            <div className="mt-2 flex items-center overflow-hidden rounded-xl border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10"><input id="provider-label" required pattern={"[a-z0-9](?:[a-z0-9\\-]{0,61}[a-z0-9])?"} maxLength={63} aria-describedby="provider-label-hint" placeholder="e.g. dataco" value={setup.label} onChange={event => setSetup(old => ({ ...old, label: event.target.value.toLowerCase() }))} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none" /><span className="shrink-0 pr-4 text-sm text-muted-foreground">.{parent}</span></div>
            <p id="provider-label-hint" className="mt-2 text-xs leading-5 text-muted-foreground">Use letters, numbers or hyphens. A weather API could become <span className="font-medium text-foreground">weather.{setup.label || "dataco"}.{parent}</span>.</p>
          </fieldset>
          <fieldset disabled={busy || !!plan || !!pending} className="border-t pt-7">
            <legend className="flex items-center gap-2 pr-3 font-medium"><Wallet className="size-4 text-primary" />2. Assign management wallets</legend>
            <p className="mt-2 text-sm text-muted-foreground">Use three different addresses. These permissions apply across the provider's shared resolver.</p>
            <div className="mt-5 space-y-6">
              {walletFields.map(({ key, title, hint, note }) => <div key={key}>
                <div className="flex items-center justify-between gap-2"><label htmlFor={`provider-${key}`} className="text-sm font-semibold">{title}</label>{key === "admin" && <button type="button" disabled={busy || !!plan || !!pending} className="text-xs font-medium text-primary disabled:opacity-50" onClick={() => setSetup(old => ({ ...old, admin: walletAddress ?? "" }))}>Use connected wallet</button>}</div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{hint}</p>
                <input id={`provider-${key}`} required pattern="0x[0-9a-fA-F]{40}" aria-describedby={`provider-${key}-hint`} spellCheck={false} autoComplete="off" className={`${field} font-mono`} placeholder="0x…" value={setup[key]} onChange={event => setSetup(old => ({ ...old, [key]: event.target.value.trim() }))} />
                <p id={`provider-${key}-hint`} className="mt-2 text-xs text-muted-foreground">{note}</p>
              </div>)}
            </div>
          </fieldset>
          <details className="rounded-xl border bg-slate-50/70 p-4">
            <summary className="cursor-pointer text-sm font-medium">Platform approval <span className="ml-2 font-normal text-muted-foreground">Provided by ENS402</span></summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">The platform registrar registers your provider name under {parent}. It must already hold the platform registration role. This step needs its signature, even when another wallet is your Provider Admin.</p>
            <label htmlFor="provider-platformSigner" className="mt-4 block text-sm font-medium">Platform registrar wallet</label>
            <input id="provider-platformSigner" required pattern="0x[0-9a-fA-F]{40}" disabled={busy || !!plan || !!pending} className={`${field} font-mono`} value={setup.platformSigner} onChange={event => setSetup(old => ({ ...old, platformSigner: event.target.value.trim() }))} />
          </details>
          {!plan && !pending && <div className="flex flex-wrap items-center gap-4"><Button type="submit" disabled={busy}>{busy ? "Checking setup…" : "Review setup"}<ArrowRight className="ml-2 size-4" /></Button><span className="text-xs text-muted-foreground">No transaction until you review and sign.</span></div>}
        </div>
      </form>
      </details>
      {(plan || pending) && <SetupProgressCard
        phase={pending?.phase ?? plan?.phase ?? 0} activity={activity}
        title={pending ? "Confirm your submitted transaction" : nextStep.title}
        description={pending ? "We are checking the transaction you already sent. No new signature is needed." : nextStep.body}
        actionLabel={pending ? "Check transaction" : nextStep.action}
        signer={pending?.step.signer ?? plan?.transactions[0]?.signer}
        signerRole={(pending?.step.signer ?? plan?.transactions[0]?.signer)?.toLowerCase() === setup.admin.toLowerCase() ? "Provider Admin" : "Platform registrar"}
        hash={pending?.hash} message={message || (!pending && plan?.transactions[0] && walletAddress?.toLowerCase() !== plan.transactions[0].signer.toLowerCase() ? "Switch to this signing wallet using the wallet selector above." : "")}
        error={failed} disabled={!pending && !!plan?.transactions[0] && walletAddress?.toLowerCase() !== plan.transactions[0].signer.toLowerCase()}
        onContinue={() => run(true)} onEdit={!pending && !plan?.hasConfirmedSetup ? () => { setPlan(null); setSetup(previous => ({ ...previous, registry: undefined, expiry: undefined })); } : undefined}
      />}
      {!plan && !pending && message && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6">{message}</p>}
      {plan && <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Technical transaction details</summary><p className="mt-3">Sepolia block {plan.observedBlock}</p><ol className="mt-2 space-y-2">{plan.transactions.map((step,index)=><li key={index}>{step.description}</li>)}</ol></details>}
      {plan?.ready && setup.registrar && setup.resolver && (
        <>
          <a
            className="mt-6 inline-block text-primary underline"
            href={`/merchant?provider=${encodeURIComponent(plan.name)}`}
          >
            Open merchant dashboard
          </a>
          <div id="publish-first-service" className="scroll-mt-28">
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
          </div>
        </>
      )}
      </>}
    </section>
  );
}
