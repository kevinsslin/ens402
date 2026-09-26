"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import { MerchantAnalytics } from "./merchant-analytics";
import { MerchantHandover } from "./merchant-handover";
import { MerchantPermissions } from "./merchant-permissions";
import { Button } from "./ui/button";
import type { merchantDashboard } from "@/server/merchant-dashboard";
type Dashboard = Awaited<ReturnType<typeof merchantDashboard>>;
export function MerchantConsole({
  walletAddress,
  getProvider,
}: {
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
  async function load() {
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
      setResult(data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Dashboard unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-shell py-12">
      <p className="eyebrow">Merchant workspace</p>
      <h1 className="mt-3 text-4xl">Your services</h1>
      <p className="mt-4 text-muted-foreground">
        See current ENS control and indexing separately. A successful
        registration is not yet a searchable listing.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <label className="flex-1 text-sm">
          Provider ENS
          <input
            className="mt-2 w-full rounded-lg border p-3"
            placeholder="provider.ens402.eth"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
        </label>
        <label className="flex-1 text-sm">
          Shared resolver (if configured)
          <input
            className="mt-2 w-full rounded-lg border p-3"
            value={sharedResolver}
            onChange={(e) => setSharedResolver(e.target.value)}
            placeholder="From provider setup"
          />
        </label>
        <Button
          className="self-end"
          disabled={busy || !walletAddress}
          onClick={load}
        >
          {busy ? "Checking…" : "Check live permissions"}
        </Button>
      </div>
      <a
        href="/provider"
        className="mt-4 inline-block text-sm text-primary underline"
      >
        Set up a provider or publish another service
      </a>
      {error && (
        <p role="alert" className="mt-5 text-sm">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="mt-6 text-sm">
            Block {result.observedBlock} ·{" "}
            {result.canPublish
              ? "Connected wallet can publish"
              : "Connected wallet has no provider publishing role"}
          </p>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Provider owner: {result.providerOwner} · Registry: {result.registry}
          </p>
          {result.indexError && (
            <p className="mt-4 text-sm">{result.indexError}</p>
          )}
          <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
            {result.services.map((row) => (
              <article
                key={row.name}
                className="min-w-0 rounded-2xl border p-5"
              >
                <h2 className="break-all text-xl">{row.name}</h2>
                <p className="mt-2 text-sm font-medium">
                  {row.state.replaceAll("-", " ")}
                </p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Service name owner: {row.owner}
                </p>
                {"service" in row && row.service && (
                  <>
                    <p className="mt-4 text-sm">{row.service.description}</p>
                    <p className="mt-2 break-all text-xs">
                      Resolver: {row.service.resolver}
                    </p>
                    <p className="mt-2 break-all text-xs">
                      Recipient: {row.service.payment.payTo}
                    </p>
                    {row.service.payment.version !== 1 && (
                      <p className="mt-2 text-sm">
                        {formatUnits(
                          BigInt(row.service.payment.pricing.amount),
                          6,
                        )}{" "}
                        USDC / request
                      </p>
                    )}
                    <p className="mt-4 text-sm">
                      Permissions at block {row.permissionsBlock}:{" "}
                      {row.permissions
                        .filter((p) => p.canWrite)
                        .map((p) => p.key)
                        .join(", ") || "None"}
                    </p>
                    {row.broadText && (
                      <p className="mt-2 text-xs">
                        This wallet has broad text write authority.
                      </p>
                    )}
                    {row.textAdmin && (
                      <p className="mt-2 text-xs">
                        This wallet can manage text grants.
                      </p>
                    )}
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
                    {row.resolverMode === "unknown" && (
                      <p className="mt-3 text-xs">
                        Confirm the provider shared resolver or configure this
                        dedicated service before using Admin handover.
                      </p>
                    )}
                    {row.textAdmin && (
                      <MerchantPermissions
                        name={row.name}
                        resolver={row.service.resolver}
                        nameRegistry={row.service.parentRegistry}
                        walletAddress={walletAddress}
                        getProvider={getProvider}
                        onChanged={() => void load()}
                      />
                    )}
                    {row.controlled && (
                      <a
                        className="mt-4 inline-block text-sm text-primary underline"
                        href={`/console?service=${encodeURIComponent(row.name)}&manage=1`}
                      >
                        Manage service in Console
                      </a>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>
          <MerchantHandover
            name={result.provider}
            nameRegistry={result.nameRegistry}
            owner={result.providerOwner}
            registry={result.registry}
            resolver={result.sharedResolver}
            getProvider={getProvider}
            onChanged={() => void load()}
          />
          <MerchantAnalytics provider={result.provider} />
          {result.services.length === 0 && (
            <p className="mt-6">
              No indexed services in this provider yet. Open this page from a
              confirmed registration to check its indexing progress.
            </p>
          )}
        </>
      )}
    </section>
  );
}
