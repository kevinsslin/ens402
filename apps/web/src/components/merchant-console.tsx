"use client";
import { EnsNameLink, RegistrationTransactionLink } from "./explorer-links";
import { PublishServiceDialog } from "./publish-service-dialog";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { MerchantAnalytics } from "./merchant-analytics";
import { MerchantHandover } from "./merchant-handover";
import { MerchantPermissions } from "./merchant-permissions";
import { Plus, Search, RefreshCw, ArrowUpRight } from "lucide-react";
import { Spinner } from "./ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import type { merchantDashboard } from "@/server/merchant-dashboard";
type Dashboard = Awaited<ReturnType<typeof merchantDashboard>>;
export function MerchantConsole({
  walletAddress,
  getProvider,
  getToken,
}: {
  getToken: () => Promise<string | null>;
  walletAddress?: string;
  getProvider: () => Promise<{
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  }>;
}) {
  const [provider, setProvider] = useState("");
  const [sharedResolver, setSharedResolver] = useState("");
  const [result, setResult] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const requestVersion = useRef(0);
  useEffect(() => {
    setResult(null);
    if (
      walletAddress &&
      new URLSearchParams(window.location.search).get("provider")
    )
      void load();
    return () => {
      requestVersion.current++;
    };
  }, [walletAddress]);
  async function refreshListings() {
    setRefreshing(true);
    setRefreshNotice(
      "Reading finalized ENS changes and updating the searchable catalog. This can take a few minutes.",
    );
    try {
      const token = await getToken();
      if (!token) throw Error("Sign in to refresh listings");
      const response = await fetch("/api/discovery/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "Refresh unavailable");
      setRefreshNotice(
        value.status === "busy"
          ? "A refresh is running or the refresh cooldown is active. Try again later. No new job was started."
          : `Catalog refresh completed${typeof value.services === "number" ? `: ${value.services} services checked` : ""}. Recent registrations can still await finality.`,
      );
      await load();
    } catch (error) {
      setRefreshNotice(
        error instanceof Error ? error.message : "Refresh unavailable",
      );
    } finally {
      setRefreshing(false);
    }
  }
  async function load() {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      const initial = new URLSearchParams(window.location.search);
      const selected = provider || initial.get("provider") || "";
      setProvider(selected);
      let resolver = sharedResolver;
      if (!resolver) {
        const parent = selected.split(".").slice(1).join(".");
        try {
          const saved = JSON.parse(
            localStorage.getItem(`ens402-provider:${selected}`) ||
              localStorage.getItem(`ens402-provider-setup:${parent}`) ||
              "null",
          );
          if (saved && `${saved.label}.${saved.parent}` === selected)
            resolver = saved.resolver || "";
        } catch {}
      }
      const query = new URLSearchParams({
        provider: selected,
        wallet: walletAddress ?? "",
      });
      if (resolver) {
        query.set("resolver", resolver);
        setSharedResolver(resolver);
      }
      if (initial.get("service")) query.set("service", initial.get("service")!);
      const response = await fetch(`/api/merchant/dashboard?${query}`);
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (version === requestVersion.current) setResult(data);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(
        cause instanceof Error ? cause.message : "Dashboard unavailable",
      );
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  const [publishing, setPublishing] = useState(false);
  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Service workspace</p>
          <h1 className="mt-2 break-all text-3xl sm:text-4xl">
            {result?.provider || provider ? (
              <EnsNameLink name={result?.provider || provider} />
            ) : (
              "Your services"
            )}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Publish APIs, manage their settings and track payments.
          </p>
        </div>
        {provider && (
          <Button onClick={() => setPublishing(true)}>
            <Plus className="mr-2 size-4" />
            Publish service
          </Button>
        )}
      </div>
      {!result && (
        <form
          className="mt-8 flex max-w-xl gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Provider ENS name</span>
            <input
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm"
              placeholder="demo.ens402.eth"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </label>
          <Button variant="outline" disabled={busy || !walletAddress}>
            {busy ? <Spinner /> : "Open provider"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-5 rounded-lg border p-4 text-sm">
          {error}
        </p>
      )}
      {busy && !result && (
        <p
          role="status"
          className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner />
          Loading your services…
        </p>
      )}
      {result && (
        <Tabs defaultValue="services" className="mt-8">
          <TabsList>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="services" className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-sans text-lg font-semibold">
                Published services{" "}
                <span className="ml-1 text-muted-foreground">
                  {result.indexError ? "" : result.services.length}
                </span>
              </h2>
              <Button
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={refreshListings}
              >
                {refreshing ? (
                  <Spinner className="mr-2" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Refresh search listings
              </Button>
            </div>
            {(result.indexError || refreshNotice) && (
              <div
                role="status"
                className="rounded-lg border bg-muted/40 px-4 py-3 text-sm"
              >
                <p>{refreshNotice || result.indexError}</p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    About search visibility
                  </summary>
                  <p className="mt-2">
                    Publishing and search indexing are separate. Refresh checks
                    finalized ENS records; new registrations can take about 15
                    minutes to appear. If refresh fails, your on-chain service
                    remains registered.
                  </p>
                </details>
              </div>
            )}
            {result.services.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
                <Search className="mx-auto size-7 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">
                  {result.indexError
                    ? "Publish or find your services"
                    : "No services listed yet"}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Start with the Hello World demo, or connect your own x402
                  endpoint. We'll check its metadata before you register its ENS
                  name.
                </p>
                <Button asChild className="mt-5">
                  <button type="button" onClick={() => setPublishing(true)}>
                    Publish a service
                  </button>
                </Button>
                <p className="mt-4 text-xs text-muted-foreground">
                  Already registered? Refresh search listings, or open the
                  confirmation link from registration.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {result.services.map((row) => (
                  <article
                    key={row.name}
                    className="min-w-0 rounded-xl border bg-card p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="break-all font-semibold">
                        <EnsNameLink name={row.name} />
                      </h3>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs">
                        {row.state === "listed"
                          ? "Searchable"
                          : row.state === "index-error"
                            ? "Search unavailable"
                            : row.state === "awaiting-index"
                              ? "Awaiting search sync"
                              : row.state.replaceAll("-", " ")}
                      </span>
                    </div>
                    <RegistrationTransactionLink name={row.name} />
                    {"service" in row && row.service && (
                      <>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {row.service.description}
                        </p>
                        {row.service.payment.version !== 1 && (
                          <p className="mt-3 text-sm font-medium">
                            {formatUnits(
                              BigInt(row.service.payment.pricing.amount),
                              6,
                            )}{" "}
                            USDC / request
                          </p>
                        )}
                        <a
                          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary"
                          href={
                            row.controlled
                              ? `/service?name=${encodeURIComponent(row.name)}`
                              : `/console?service=${encodeURIComponent(row.name)}`
                          }
                        >
                          {row.controlled ? "Manage service" : "Open service"}
                          <ArrowUpRight className="size-3" />
                        </a>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="mt-4 w-full">
                              Permissions and ownership
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl p-6">
                            <DialogHeader>
                              <DialogTitle>{row.name}</DialogTitle>
                              <DialogDescription>
                                View current authority and manage access or
                                ownership.
                              </DialogDescription>
                            </DialogHeader>
                            <Tabs defaultValue="permissions">
                              <TabsList>
                                <TabsTrigger value="permissions">
                                  Permissions
                                </TabsTrigger>
                                <TabsTrigger value="ownership">
                                  Ownership
                                </TabsTrigger>
                              </TabsList>
                              <TabsContent
                                value="ownership"
                                className="space-y-5"
                              >
                                <p className="mt-3 break-all text-xs">
                                  Name owner: {row.owner}
                                </p>
                                <p className="mt-2 break-all text-xs">
                                  Resolver: {row.service.resolver}
                                </p>
                                <p className="mt-2 break-all text-xs">
                                  Payment recipient: {row.service.payment.payTo}
                                </p>
                                {row.resolverMode !== "unknown" && (
                                  <MerchantHandover
                                    name={row.name}
                                    nameRegistry={row.service.parentRegistry}
                                    owner={row.owner}
                                    resolver={
                                      row.resolverMode === "dedicated"
                                        ? row.service.resolver
                                        : undefined
                                    }
                                    getProvider={getProvider}
                                    onChanged={() => void load()}
                                  />
                                )}
                              </TabsContent>
                              <TabsContent value="permissions" className="mt-5">
                                <MerchantPermissions
                                  name={row.name}
                                  resolver={row.service.resolver}
                                  nameRegistry={row.service.parentRegistry}
                                  walletAddress={walletAddress}
                                  getProvider={getProvider}
                                  canManage={row.textAdmin}
                                  onChanged={() => void load()}
                                />
                              </TabsContent>
                            </Tabs>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="payments" className="mt-6">
            <MerchantAnalytics provider={result.provider} />
          </TabsContent>
          <TabsContent value="settings" className="mt-6 space-y-5">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-sans text-lg font-semibold">
                Provider settings
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {result.canPublish
                  ? "Your connected wallet can register services."
                  : "This wallet can view the provider. Publishing requires an authorized wallet."}
              </p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-[140px_1fr]">
                <dt className="text-muted-foreground">Provider owner</dt>
                <dd className="break-all font-mono text-xs">
                  {result.providerOwner}
                </dd>
                <dt className="text-muted-foreground">Provider registry</dt>
                <dd className="break-all font-mono text-xs">
                  {result.registry}
                </dd>
                <dt className="text-muted-foreground">Shared resolver</dt>
                <dd className="break-all font-mono text-xs">
                  {result.sharedResolver || "Not selected"}
                </dd>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Verified at Sepolia block {result.observedBlock}.
              </p>
            </div>
            <details className="rounded-xl border bg-card p-5">
              <summary className="cursor-pointer text-sm font-medium">
                Advanced: change provider or resolver
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Provider ENS
                  <input
                    className="mt-2 w-full rounded-lg border p-3"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Shared resolver
                  <input
                    className="mt-2 w-full rounded-lg border p-3"
                    value={sharedResolver}
                    onChange={(e) => setSharedResolver(e.target.value)}
                  />
                </label>
              </div>
              <Button
                className="mt-4"
                variant="outline"
                disabled={busy}
                onClick={() => void load()}
              >
                Check settings
              </Button>
            </details>
            <details className="rounded-xl border border-amber-200 bg-card p-5">
              <summary className="cursor-pointer text-sm font-medium">
                Transfer provider administration
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">
                Use this only when changing the provider's administrator.
              </p>
              <MerchantHandover
                name={result.provider}
                nameRegistry={result.nameRegistry}
                owner={result.providerOwner}
                registry={result.registry}
                resolver={result.sharedResolver}
                getProvider={getProvider}
                onChanged={() => void load()}
              />
            </details>
          </TabsContent>
        </Tabs>
      )}
      <PublishServiceDialog
        provider={publishing ? result?.provider || provider : null}
        walletAddress={walletAddress}
        getToken={getToken}
        getProvider={getProvider}
        onClose={() => setPublishing(false)}
        onComplete={() => {
          setPublishing(false);
          void load();
        }}
      />
    </section>
  );
}
