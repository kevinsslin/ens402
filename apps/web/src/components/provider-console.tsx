"use client";
import { EnsNameLink, RegistrationTransactionLink } from "./explorer-links";
import Link from "next/link";
import { ArrowRight, Building2, Plus, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { Button } from "./ui/button";
import {
  confirmSetup,
  runSetupSequence,
  setupError,
  setupStepCopy,
  type PendingSetup,
} from "./setup-flow";
import { SetupProgressCard, type SetupActivity } from "./setup-progress-card";
import { selectedWallet } from "./wallet-session";
import { PlatformBootstrap } from "./platform-bootstrap";
import { PublishServiceDialog } from "./publish-service-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { ProviderSetup } from "@/server/provider-plan";
type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
type Plan = {
  registrationMode?: "direct" | "commit-reveal";
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
    actions?: string[];
    gas?: string;
  }[];
};
type PendingProvider = PendingSetup & { setup: ProviderSetup; phase: number };
type Directory = Awaited<
  ReturnType<typeof import("@/server/provider-directory").providerDirectory>
>;
const field =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-muted-foreground";
const walletFields = [
  {
    key: "admin",
    title: "Provider Admin",
    hint: "Owns the provider name, manages service registration and grants or replaces wallet permissions. Also retains full text control of the shared resolver.",
    note: "Use a wallet you control.",
  },
  {
    key: "ops",
    title: "Operations wallet",
    hint: "Updates descriptions, images, API endpoints and call schemas across your services. Cannot change payment terms.",
    note: "A separate hot wallet or agent wallet.",
  },
  {
    key: "treasury",
    title: "Treasury Admin",
    hint: "Updates payment terms across your services. Each service's name holder is its payment recipient.",
    note: "An EOA, multisig or MPC wallet, separate from Provider Admin and Operations.",
  },
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
  const running = useRef(false);
  const mounted = useRef(true);
  const resumedHash = useRef<string | null>(null);
  const activeWallet = useRef(walletAddress);
  activeWallet.current = walletAddress;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hasSetupProgress = Boolean(plan || pending);
  useEffect(() => {
    if (hasSetupProgress)
      document
        .getElementById("provider-setup-progress")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasSetupProgress]);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [publishTarget, setPublishTarget] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryVersion, setDirectoryVersion] = useState(0);
  const [workspacePlans, setWorkspacePlans] = useState<Record<string, Plan>>(
    {},
  );
  useEffect(() => {
    const controller = new AbortController();
    setWorkspacePlans({});
    for (const provider of directory?.providers ?? []) {
      let saved: ProviderSetup;
      try {
        saved = JSON.parse(
          localStorage.getItem(`ens402-provider:${provider.name}`) ||
            localStorage.getItem(`ens402-provider-setup:${parent}`) ||
            "null",
        );
        if (!saved || `${saved.label}.${saved.parent}` !== provider.name)
          continue;
      } catch {
        continue;
      }
      void fetch("/api/provider/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return;
          const current = (await response.json()) as Plan;
          if (!controller.signal.aborted)
            setWorkspacePlans((previous) => ({
              ...previous,
              [provider.name]: current,
            }));
        })
        .catch(() => {
          /* Workspace management remains available if setup verification is temporarily unavailable. */
        });
    }
    return () => controller.abort();
  }, [directory, parent]);
  const [creating, setCreating] = useState(false);
  const [publicationMode, setPublicationMode] = useState(false);
  useEffect(() => {
    setPublicationMode(window.location.hash === "#publish-first-service");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setDirectory(null);
    setDirectoryError("");
    setDirectoryLoading(true);
    setCreating(false);
    if (!walletAddress) {
      setDirectoryLoading(false);
      return;
    }
    fetch(
      `/api/provider/directory?wallet=${encodeURIComponent(walletAddress)}`,
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(25_000),
        ]),
      },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        return data as Directory;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setDirectory(data);
        setSetup((previous) => ({
          ...previous,
          platformSigner:
            previous.platformSigner === walletAddress ||
            !previous.platformSigner
              ? data.platformOwner
              : previous.platformSigner,
        }));
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setDirectoryError(
            error instanceof Error && error.name === "TimeoutError"
              ? "Sepolia is taking too long to return your workspaces. Retry the lookup or open a known provider. No transaction was sent."
              : error instanceof Error
                ? error.message
                : "Provider lookup unavailable",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDirectoryLoading(false);
      });
    return () => controller.abort();
  }, [walletAddress, directoryVersion]);
  const storageKey = `ens402-provider-setup:${parent}`;
  const pendingKey = `${storageKey}:transaction`;
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "provider",
    );
    const raw =
      (requested
        ? localStorage.getItem(`ens402-provider:${requested}`)
        : null) || localStorage.getItem(storageKey);
    try {
      const saved = JSON.parse(
        localStorage.getItem(pendingKey) || "null",
      ) as PendingProvider | null;
      setPending(
        saved?.setup?.parent === parent &&
          /^0x[0-9a-fA-F]{64}$/.test(saved.hash)
          ? saved
          : null,
      );
    } catch {
      setPending(null);
    }
    if (raw) {
      try {
        const saved = JSON.parse(raw) as ProviderSetup;
        const associated = [
          saved.admin,
          saved.platformSigner,
          saved.ops,
          saved.treasury,
        ].some(
          (value) => value?.toLowerCase() === walletAddress?.toLowerCase(),
        );
        if (
          saved.parent === parent &&
          associated &&
          (!requested || `${saved.label}.${saved.parent}` === requested)
        ) {
          setSetup(saved);
          setCreating(!saved.registrar);
        } else
          setSetup({
            parent,
            label: "",
            admin: walletAddress ?? "",
            platformSigner: "",
            ops: "",
            treasury: "",
            salt: BigInt(
              `0x${crypto.randomUUID().replaceAll("-", "")}`,
            ).toString(),
          });
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
  const [publishing, setPublishing] = useState<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (window.location.hash === "#publish-first-service")
      setPublishing(query.get("provider"));
    if (query.get("setup") === "1") setCreating(true);
  }, []);
  const completedSetup = useRef("");
  useEffect(() => {
    if (
      !creating ||
      busy ||
      !plan?.ready ||
      completedSetup.current === plan.name
    )
      return;
    completedSetup.current = plan.name;
    setCreating(false);
    setDirectoryVersion((v) => v + 1);
  }, [creating, busy, plan]);
  function startNew() {
    setCreating(true);
    completedSetup.current = "";
    setPublicationMode(false);
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
    setMessage("Choose a workspace name and its management wallets.");
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
    setMessage(
      "Waiting for Sepolia confirmation. You can leave this page and return later.",
    );
    const receipt = await confirmSetup(transaction);
    if (receipt.status === "reverted") {
      localStorage.removeItem(pendingKey);
      setPending(null);
      throw Error(
        "The transaction reverted. Your setup is saved. Review and try this step again.",
      );
    }
    const next = {
      ...transaction.setup,
      ...(!transaction.step.to && receipt.contractAddress
        ? { registrar: receipt.contractAddress }
        : {}),
    };
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSetup(next);
    localStorage.removeItem(pendingKey);
    setPending(null);
    setActivity("checking");
    return next;
  }
  async function run(sign = false) {
    if (running.current) return;
    running.current = true;
    const startingWallet = walletAddress;
    const active = () =>
      mounted.current && activeWallet.current === startingWallet;
    setBusy(true);
    setMessage("");
    setFailed(false);
    setActivity("checking");
    try {
      let currentSetup = setup;
      if (pending) {
        resumedHash.current = pending.hash;
        currentSetup = await finishTransaction(pending);
      }
      if (!active()) return;
      if (!sign) {
        await refresh(currentSetup);
        return;
      }
      let currentPhase = 0;
      const complete = await runSetupSequence({
        setup: currentSetup,
        confirmedStep: pending
          ? { ...pending.step, gas: undefined as string | undefined }
          : undefined,
        active,
        plan: async (current) => {
          setActivity("checking");
          const next = await refresh(current, true);
          currentPhase = next.phase;
          return next;
        },
        submit: async (step, current) => {
          if (!step.gas)
            throw Error(
              "Transaction preparation is incomplete. Review the setup again.",
            );
          const provider = await getProvider();
          if (!active())
            throw Error(
              "Setup paused because the connected wallet changed or the page closed.",
            );
          const signer = (await selectedWallet(
            provider,
            step.signer,
            "0xaa36a7",
          )) as Address;
          if (!active())
            throw Error(
              "Setup paused because the connected wallet changed or the page closed.",
            );
          setActivity("wallet");
          setMessage(
            "Confirm this step in your wallet. After confirmation, the next wallet request opens automatically.",
          );
          const hash = await createWalletClient({
            chain: sepolia,
            transport: custom(provider),
          }).sendTransaction({
            account: signer,
            ...(step.to ? { to: step.to as Address } : {}),
            data: step.data as Hex,
            value: 0n,
            gas: BigInt(step.gas),
          });
          const transaction = {
            hash,
            step,
            setup: current,
            phase: currentPhase,
          };
          localStorage.setItem(pendingKey, JSON.stringify(transaction));
          resumedHash.current = hash;
          setPending(transaction);
          return transaction;
        },
        confirm: finishTransaction,
      });
      if (complete)
        setMessage("Setup is complete. You can publish your first service.");
    } catch (error) {
      if (mounted.current) {
        setFailed(true);
        setMessage(setupError(error));
      }
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        setActivity("idle");
      }
    }
  }
  useEffect(() => {
    if (
      !pending ||
      busy ||
      running.current ||
      !walletAddress ||
      resumedHash.current === pending.hash
    )
      return;
    if (pending.step.signer.toLowerCase() !== walletAddress.toLowerCase())
      return;
    resumedHash.current = pending.hash;
    void run(true);
  }, [pending, busy, walletAddress]);
  const nextStep = setupStepCopy(plan?.transactions[0]?.description);
  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8">
      <p className="eyebrow">Onboard your service</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-5xl">Your services</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            {publicationMode
              ? "Choose a demo or connect your own x402 endpoint."
              : "Manage your workspaces and registered services in one place."}
          </p>
        </div>
        {directory && directory.providers.length > 0 && (
          <Button
            variant="outline"
            disabled={busy || !!pending || (!!plan && !plan.ready)}
            onClick={startNew}
          >
            <Plus className="mr-2 size-4" />
            Create workspace
          </Button>
        )}
      </div>
      {publicationMode && directory && !setup.registrar && (
        <p role="status" className="mt-6 rounded-lg border p-4 text-sm">
          Open this provider's saved setup to publish. If you set it up in
          another browser, use that browser to recover its publishing
          configuration.
        </p>
      )}
      {!walletAddress && (
        <p className="mt-8 text-sm text-muted-foreground">
          Connect a wallet above to find your providers or create one.
        </p>
      )}
      {directoryLoading && (
        <p
          role="status"
          className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <RefreshCw className="size-4 animate-spin" />
          Reading your workspaces and services from Sepolia. No signature
          needed…
        </p>
      )}
      {directoryError && (
        <div
          role="alert"
          className="mt-6 rounded-xl border bg-slate-50 p-5 text-sm"
        >
          <p>{directoryError}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => setDirectoryVersion((value) => value + 1)}
            >
              Retry
            </Button>
            <Button asChild variant="outline">
              <Link href="/merchant">Open a known provider</Link>
            </Button>
            <Button variant="ghost" onClick={() => setCreating(true)}>
              Create a provider
            </Button>
          </div>
        </div>
      )}
      {directory && directory.providers.length > 0 && (
        <div className="mt-10 space-y-10">
          <section aria-labelledby="workspaces-heading">
            <h2 id="workspaces-heading" className="text-2xl">
              Service workspaces
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your team's wallets, shared permissions and publishing
              setup.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {directory.providers.map((provider) => {
                const current =
                  plan?.name === provider.name
                    ? plan
                    : workspacePlans[provider.name];
                const incomplete = current && !current.ready;
                return (
                  <article
                    key={provider.name}
                    className="rounded-2xl border bg-card p-6"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="size-5 text-primary" />
                      <h3 className="break-all font-semibold">
                        <EnsNameLink name={provider.name} />
                      </h3>
                    </div>
                    <RegistrationTransactionLink
                      name={provider.name}
                      hash={provider.registrationTransaction}
                    />
                    <p className="mt-3 text-sm text-muted-foreground">
                      {provider.role}
                      {incomplete
                        ? " · Setup incomplete"
                        : current?.ready
                          ? " · Ready"
                          : ""}
                    </p>
                    {incomplete ? (
                      <Button
                        className="mt-5"
                        disabled={busy || !!pending}
                        onClick={() => {
                          setSetup(current.setup);
                          setPlan(current);
                          setCreating(true);
                          setPublicationMode(false);
                        }}
                      >
                        Continue setup <ArrowRight className="ml-2 size-4" />
                      </Button>
                    ) : (
                      <Button asChild variant="outline" className="mt-5">
                        <Link
                          href={`/merchant?provider=${encodeURIComponent(provider.name)}`}
                        >
                          Manage workspace{" "}
                          <ArrowRight className="ml-2 size-4" />
                        </Link>
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          <section aria-labelledby="registered-services-heading">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="registered-services-heading" className="text-2xl">Registered services</h2>
              <div className="flex flex-wrap items-center gap-2">
                {directory.providers.length > 1 && <select
                  aria-label="Workspace to publish in"
                  className="h-10 max-w-full rounded-lg border bg-background px-3 text-sm"
                  value={directory.providers.some(p => p.name === publishTarget) ? publishTarget : directory.providers[0]?.name}
                  onChange={event => setPublishTarget(event.target.value)}
                >{directory.providers.map(provider => <option key={provider.name} value={provider.name}>{provider.name}</option>)}</select>}
                <Button variant="outline" disabled={!directory.providers.length} onClick={() => {
                  const target = directory.providers.find(provider => provider.name === publishTarget) ?? directory.providers[0];
                  if (target) setPublishing(target.name);
                }}><Plus className="mr-2 size-4" />Publish service</Button>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Edit your services or publish a new endpoint.
            </p>
            <div className="mt-5 space-y-3">
              {directory.providers.filter(provider => provider.serviceNames.length > 0).map(provider => (
                <div key={provider.name} className="space-y-3">
                  <p className="pt-2 text-sm text-muted-foreground"><EnsNameLink name={provider.name} /></p>
                  {provider.serviceNames.map(name => (
                    <article key={name} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
                      <div>
                        <h3 className="break-all font-semibold"><EnsNameLink name={name} label={name.endsWith(`.${provider.name}`) ? name.slice(0, -provider.name.length - 1) : name} /></h3>
                        <RegistrationTransactionLink name={name} hash={provider.serviceTransactions?.[name]} />
                      </div>
                      <Button asChild variant="outline"><Link href={`/service?name=${encodeURIComponent(name)}`}>Manage service <ArrowRight className="ml-2 size-4" /></Link></Button>
                    </article>
                  ))}
                </div>
              ))}
              {directory.providers.some(
                (provider) => provider.servicesUnavailable,
              ) && (
                <p role="status" className="rounded-xl border p-5 text-sm">
                  Some services could not be loaded. You can still open their
                  workspace above.
                </p>
              )}
              {directory.providers.every(
                (provider) =>
                  !provider.servicesUnavailable &&
                  provider.serviceNames.length === 0,
              ) && (
                <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                  No registered services yet. Publish your first API from a
                  workspace.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {directory &&
        !directory.platformReady &&
        directory.platformOwner.toLowerCase() ===
          walletAddress?.toLowerCase() && (
          <PlatformBootstrap
            parent={parent}
            walletAddress={walletAddress}
            getProvider={getProvider}
          />
        )}
      {directory && directory.providers.length === 0 && !directoryLoading && (
        <div className="mt-8 rounded-2xl border border-dashed p-8">
          <h2 className="text-xl">Create your first workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Group your services under one ENS name and choose who manages them.
          </p>
          <Button className="mt-5" onClick={startNew}>
            Create workspace
          </Button>
        </div>
      )}
      {(pending || (plan && !plan.ready)) && !creating && (
        <Button className="mt-6" onClick={() => setCreating(true)}>
          Continue workspace setup
        </Button>
      )}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!busy) setCreating(open);
        }}
      >
        <DialogContent
          scrollable
          className="sm:max-w-3xl"
          closeDisabled={busy}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {plan || pending ? "Set up workspace" : "Create workspace"}
            </DialogTitle>
            <DialogDescription>
              Choose an ENS name and assign your team's management wallets.
            </DialogDescription>
          </DialogHeader>
          <div hidden={publicationMode && !!plan?.ready}>
            <ol
              aria-label="Onboarding progress"
              className="mt-8 grid grid-cols-3 gap-2 text-sm"
            >
              {["Your details", "Set up on Sepolia", "Publish a service"].map(
                (label, index) => (
                  <li
                    key={label}
                    aria-current={
                      index === (plan?.ready ? 2 : plan || pending ? 1 : 0)
                        ? "step"
                        : undefined
                    }
                    className={`rounded-xl border px-3 py-3 ${index === (plan?.ready ? 2 : plan || pending ? 1 : 0) ? "border-primary/30 bg-primary/5 font-medium text-primary" : "text-muted-foreground"}`}
                  >
                    <span className="mr-2">{index + 1}.</span>
                    {label}
                  </li>
                ),
              )}
            </ol>
            <details
              open={!plan && !pending}
              className="mt-5 rounded-2xl border bg-white"
            >
              <summary className="cursor-pointer px-6 py-4 text-sm font-medium">
                Provider details
                {setup.label ? `: ${setup.label}.${parent}` : ""}
              </summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run();
                }}
                className="overflow-hidden rounded-b-2xl bg-white"
              >
                <div className="border-b bg-slate-50/70 px-6 py-5 sm:px-8">
                  <h2 className="text-2xl">Workspace details</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    A provider groups your services under one ENS name and one
                    set of management wallets.
                  </p>
                </div>
                <div className="space-y-8 p-6 sm:p-8">
                  <fieldset disabled={busy || !!plan || !!pending}>
                    <legend className="flex items-center gap-2 font-medium">
                      <Building2 className="size-4 text-primary" />
                      1. Choose your name
                    </legend>
                    <label
                      htmlFor="provider-label"
                      className="mt-4 block text-sm font-medium"
                    >
                      Provider name
                    </label>
                    <div className="mt-2 flex items-center overflow-hidden rounded-xl border focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                      <input
                        id="provider-label"
                        required
                        pattern={"[a-z0-9](?:[a-z0-9\\-]{0,61}[a-z0-9])?"}
                        maxLength={63}
                        aria-describedby="provider-label-hint"
                        placeholder="e.g. dataco"
                        value={setup.label}
                        onChange={(event) =>
                          setSetup((old) => ({
                            ...old,
                            label: event.target.value.toLowerCase(),
                          }))
                        }
                        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none"
                      />
                      <span className="shrink-0 pr-4 text-sm text-muted-foreground">
                        .{parent}
                      </span>
                    </div>
                    <p
                      id="provider-label-hint"
                      className="mt-2 text-xs leading-5 text-muted-foreground"
                    >
                      Use letters, numbers or hyphens. A weather API could
                      become{" "}
                      <span className="font-medium text-foreground">
                        weather.{setup.label || "dataco"}.{parent}
                      </span>
                      .
                    </p>
                  </fieldset>
                  <fieldset
                    disabled={busy || !!plan || !!pending}
                    className="border-t pt-7"
                  >
                    <legend className="flex items-center gap-2 pr-3 font-medium">
                      <Wallet className="size-4 text-primary" />
                      2. Assign management wallets
                    </legend>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Use three different addresses. These permissions apply
                      across the provider's shared resolver.
                    </p>
                    <div className="mt-5 space-y-6">
                      {walletFields.map(({ key, title, hint, note }) => (
                        <div key={key}>
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`provider-${key}`}
                              className="text-sm font-semibold"
                            >
                              {title}
                            </label>
                            {key === "admin" && (
                              <button
                                type="button"
                                disabled={busy || !!plan || !!pending}
                                className="text-xs font-medium text-primary disabled:opacity-50"
                                onClick={() =>
                                  setSetup((old) => ({
                                    ...old,
                                    admin: walletAddress ?? "",
                                  }))
                                }
                              >
                                Use connected wallet
                              </button>
                            )}
                          </div>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                            {hint}
                          </p>
                          <input
                            id={`provider-${key}`}
                            required
                            pattern="0x[0-9a-fA-F]{40}"
                            aria-describedby={`provider-${key}-hint`}
                            spellCheck={false}
                            autoComplete="off"
                            className={`${field} font-mono`}
                            placeholder="0x…"
                            value={setup[key]}
                            onChange={(event) =>
                              setSetup((old) => ({
                                ...old,
                                [key]: event.target.value.trim(),
                              }))
                            }
                          />
                          <p
                            id={`provider-${key}-hint`}
                            className="mt-2 text-xs text-muted-foreground"
                          >
                            {note}
                          </p>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                  <details className="rounded-xl border bg-slate-50/70 p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Platform approval{" "}
                      <span className="ml-2 font-normal text-muted-foreground">
                        Provided by ENS402
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      The platform registrar registers your provider name under{" "}
                      {parent}. It must already hold the platform registration
                      role. This step needs its signature, even when another
                      wallet is your Provider Admin.
                    </p>
                    <label
                      htmlFor="provider-platformSigner"
                      className="mt-4 block text-sm font-medium"
                    >
                      Platform registrar wallet
                    </label>
                    <input
                      id="provider-platformSigner"
                      required
                      pattern="0x[0-9a-fA-F]{40}"
                      disabled={busy || !!plan || !!pending}
                      className={`${field} font-mono`}
                      value={setup.platformSigner}
                      onChange={(event) =>
                        setSetup((old) => ({
                          ...old,
                          platformSigner: event.target.value.trim(),
                        }))
                      }
                    />
                  </details>
                  {!plan && !pending && (
                    <div className="flex flex-wrap items-center gap-4">
                      <Button type="submit" disabled={busy}>
                        {busy ? "Checking setup…" : "Review setup"}
                        <ArrowRight className="ml-2 size-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        No transaction until you review and sign.
                      </span>
                    </div>
                  )}
                </div>
              </form>
            </details>
            {(plan || pending) && (
              <SetupProgressCard
                phase={pending?.phase ?? plan?.phase ?? 0}
                activity={activity}
                transactions={
                  plan?.transactions ?? (pending ? [pending.step] : [])
                }
                parties={{
                  ops: setup.ops,
                  treasury: setup.treasury,
                  registrar: setup.registrar,
                }}
                actions={
                  pending?.step.actions ?? plan?.transactions[0]?.actions
                }
                stepDescription={
                  pending?.step.description ??
                  plan?.transactions[0]?.description
                }
                title={
                  pending
                    ? setupStepCopy(pending.step.description).title
                    : nextStep.title
                }
                description={
                  pending
                    ? `${setupStepCopy(pending.step.description).body} Submitted. Checking automatically; no new signature is needed.`
                    : nextStep.body
                }
                actionLabel={pending ? "Check transaction" : nextStep.action}
                signer={pending?.step.signer ?? plan?.transactions[0]?.signer}
                signerRole={
                  (
                    pending?.step.signer ?? plan?.transactions[0]?.signer
                  )?.toLowerCase() === setup.admin.toLowerCase()
                    ? "Provider Admin"
                    : "Platform registrar"
                }
                hash={pending?.hash}
                message={
                  message ||
                  (!pending &&
                  plan?.transactions[0] &&
                  walletAddress?.toLowerCase() !==
                    plan.transactions[0].signer.toLowerCase()
                    ? "Switch to this signing wallet using the wallet selector above."
                    : "")
                }
                error={failed}
                disabled={
                  !pending &&
                  !!plan?.transactions[0] &&
                  walletAddress?.toLowerCase() !==
                    plan.transactions[0].signer.toLowerCase()
                }
                onContinue={() => run(true)}
                onEdit={
                  !pending && !plan?.hasConfirmedSetup
                    ? () => {
                        setPlan(null);
                        setSetup((previous) => ({
                          ...previous,
                          registry: undefined,
                          expiry: undefined,
                        }));
                      }
                    : undefined
                }
              />
            )}
            {!plan && !pending && message && (
              <p
                role="status"
                className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6"
              >
                {message}
              </p>
            )}
            {plan && (
              <details className="mt-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Technical transaction details
                </summary>
                <p className="mt-3">Sepolia block {plan.observedBlock}</p>
                <ol className="mt-2 space-y-2">
                  {plan.transactions.map((step, index) => (
                    <li key={index}>{step.description}</li>
                  ))}
                </ol>
              </details>
            )}
          </div>
          {plan?.ready && setup.registrar && setup.resolver && (
            <>
              <a
                className="mt-6 inline-block text-primary underline"
                href={`/merchant?provider=${encodeURIComponent(plan.name)}`}
              >
                Open merchant dashboard
              </a>
              {plan.registrationMode === "commit-reveal" && (
                <div className="mt-6 rounded-xl border p-5 text-sm">
                  <h3 className="font-semibold">
                    Switch to one-transaction publishing
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    This provider still uses the earlier two-transaction
                    registrar. Replace only the publisher contract, authorize
                    it, then remove the old publisher's permissions. Your ENS
                    names, registry, resolver and service records stay in place.
                    This one-time setup requires multiple wallet confirmations.
                    Finish any pending service registration first.
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    disabled={
                      busy ||
                      !!pending ||
                      walletAddress?.toLowerCase() !== setup.admin.toLowerCase()
                    }
                    onClick={() => {
                      const next = {
                        ...setup,
                        previousRegistrar: setup.registrar,
                        registrar: undefined,
                      };
                      localStorage.setItem(storageKey, JSON.stringify(next));
                      localStorage.setItem(
                        `ens402-provider:${plan.name}`,
                        JSON.stringify(next),
                      );
                      setSetup(next);
                      setPlan(null);
                      setCreating(true);
                      setPublicationMode(false);
                      setMessage(
                        "Publisher replacement prepared. Continue setup to deploy, authorize and retire the old publisher.",
                      );
                    }}
                  >
                    Set up one-transaction publishing
                  </Button>
                </div>
              )}
              <Button
                className="mt-5"
                onClick={() => {
                  setCreating(false);
                  setPublishing(plan.name);
                }}
              >
                Publish service
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <PublishServiceDialog
        provider={publishing}
        walletAddress={walletAddress}
        getToken={getToken}
        getProvider={getProvider}
        onClose={() => {
          setPublishing(null);
          setPublicationMode(false);
          window.history.replaceState(null, "", "/provider");
        }}
        onComplete={() => {
          setPublishing(null);
          setPublicationMode(false);
          window.history.replaceState(null, "", "/provider");
          setDirectoryVersion((v) => v + 1);
        }}
      />
    </section>
  );
}
