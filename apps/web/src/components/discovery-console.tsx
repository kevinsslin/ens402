"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { formatUnits, parseUnits } from "viem";
import {
  discover,
  DiscoveryApiError,
  type DiscoveryService,
  type DiscoveryResponse,
} from "@ens402/sdk/discovery";
import { ArrowRight, Search, SlidersHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentSetup } from "./agent-setup";

function probeCommand(service: DiscoveryService) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return service.call.method === "POST"
    ? `curl --request POST --header 'Content-Type: application/json' --data ${quote(JSON.stringify(service.call.example ?? {}))} ${quote(service.endpoint)}`
    : `curl --include ${quote(service.endpoint)}`;
}

export function DiscoveryConsole({
  embedded = false,
  onSelect,
  selecting = false,
}: {
  embedded?: boolean;
  onSelect?: (name: string) => void;
  selecting?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalogNotReady, setCatalogNotReady] = useState(false);
  const [error, setError] = useState("");
  async function search(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setCatalogNotReady(false);
    setResult(null);
    try {
      if (ceiling && !/^\d+(\.\d{1,6})?$/.test(ceiling))
        throw new Error("Enter a USDC price with up to 6 decimal places.");
      setResult(
        await discover(
          {
            query,
            mode: "hybrid",
            pageSize: 20,
            ...(ceiling
              ? { maxPricePerRequestAtomic: parseUnits(ceiling, 6).toString() }
              : {}),
          },
          { apiUrl: new URL("/api/discover", window.location.origin).href },
        ),
      );
    } catch (cause) {
      if (cause instanceof DiscoveryApiError && cause.code === "CATALOG_NOT_READY") {
        setCatalogNotReady(true);
        return;
      }
      setError(
        cause instanceof Error && cause.message.includes("(503)")
          ? "Service search is temporarily unavailable. Please try again later."
          : cause instanceof Error
            ? cause.message
            : "Search is unavailable. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={embedded ? "py-6" : "section-shell max-w-5xl py-12 sm:py-20"}
      aria-label="Find services"
    >
      {!embedded && <p className="eyebrow">Search services</p>}
      {embedded ? (
        <h2 className="text-3xl sm:text-4xl">Find a service for your next task.</h2>
      ) : (
        <h1 className="mt-3 text-4xl sm:text-6xl">
          Find a service for your next task.
        </h1>
      )}
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Search in your own words. Compare APIs, review their terms, and call them with your agent.
      </p>
      <form
        onSubmit={search}
        className="mt-8"
      >
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-white p-2 shadow-[0_6px_24px_-12px_rgba(82,152,255,0.35)] transition-shadow focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
            <Search className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <label htmlFor="service-prompt" className="sr-only">Describe the service you need</label>
            <input
              id="service-prompt"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={busy}
              maxLength={500}
              placeholder="Weather forecasts, exchange rates, research…"
              className="h-14 w-full min-w-0 bg-transparent text-base outline-none disabled:opacity-60"
            />
          </div>
          <Button type="submit" disabled={busy || selecting} className="h-12 shrink-0 gap-2 rounded-xl px-6">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}
            {busy ? "Searching…" : "Search services"}
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
          <span>Search by keyword or meaning</span>
          <span>Base Sepolia · USDC</span>
        </div>
        <details className="mt-4 text-sm">
          <summary className="w-fit cursor-pointer text-muted-foreground">
            <SlidersHorizontal
              className="mr-2 inline size-3.5"
              aria-hidden="true"
            />
            Price filter
          </summary>
          <label className="mt-3 block max-w-64 text-sm">
            Maximum USDC per request
            <input
              value={ceiling}
              disabled={busy}
              onChange={(e) => setCeiling(e.target.value)}
              inputMode="decimal"
              placeholder="No limit"
              className="mt-2 w-full rounded-lg border px-3 py-2"
            />
          </label>
        </details>
      </form>
      <AgentSetup search={{ query, valid: !ceiling || /^\d+(\.\d{1,6})?$/.test(ceiling), ...(/^\d+(\.\d{1,6})?$/.test(ceiling) ? { maxPricePerRequestAtomic: parseUnits(ceiling, 6).toString() } : {}) }} />
      {!result && !busy && !error && !catalogNotReady && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Example prompts">
          {[
            "Weather forecast for Tokyo",
            "USD to JPY exchange rate",
            "Research agent payments",
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setQuery(prompt);
                document.getElementById("service-prompt")?.focus();
              }}
              className="rounded-full border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
      {catalogNotReady && (
        <div role="status" className="mt-8 rounded-2xl border bg-slate-50/70 p-6 sm:p-8">
          <p className="text-lg font-semibold">The service directory is not live yet.</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            The first on-chain catalog sync has not completed. Services will appear here after platform setup, publication, and indexing.
          </p>
          <Button asChild variant="outline" className="mt-5 bg-white">
            <Link href="/provider">Open service onboarding <ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link>
          </Button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm"
        >
          {error}
        </p>
      )}
      <div
        role="status"
        aria-live="polite"
        className="mt-6 text-sm text-muted-foreground"
      >
        {result &&
          `${result.results.length} ${result.results.length === 1 ? "candidate" : "candidates"} · ${result.semantic === "used" ? "Keyword + semantic search" : result.semantic === "unavailable" ? "Keyword search · semantic search unavailable" : "Keyword search"}`}
      </div>
      {result && (
        <>
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            {result.results.map(({ service, match }) => (
              <article
                key={service.name}
                className="min-w-0 rounded-2xl border bg-white p-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                    {service.fixture ? "Demo fixture" : "Indexed service"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {service.call.method}
                  </span>
                </div>
                <h2 className="mt-4 break-all text-xl font-medium">
                  {service.name}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {service.description}
                </p>
                <p className="mt-4 font-medium">
                  {formatUnits(
                    BigInt(service.pricePerRequestAtomic),
                    service.assetDecimals,
                  )}{" "}
                  USDC{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / request
                  </span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Matches:{" "}
                  {match
                    .map(
                      (m) =>
                        ({
                          name: "ENS name",
                          keyword: "keywords",
                          semantic: "meaning",
                        })[m],
                    )
                    .join(", ") || "catalog filters"}
                  . Relevance is not a safety rating.
                </p>
                <details className="mt-5 border-t pt-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    How to call it
                  </summary>
                  <p className="mt-3 break-all font-mono text-xs">
                    {service.call.method} {service.endpoint}
                  </p>
                  {service.call.inputSchema && (
                    <>
                      <h3 className="mt-4 text-xs font-medium">Input schema</h3>
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                        {JSON.stringify(service.call.inputSchema, null, 2)}
                      </pre>
                    </>
                  )}
                  {service.call.example && (
                    <>
                      <h3 className="mt-4 text-xs font-medium">
                        Example input
                      </h3>
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                        {JSON.stringify(service.call.example, null, 2)}
                      </pre>
                    </>
                  )}
                  {service.call.outputExample && (
                    <>
                      <h3 className="mt-4 text-xs font-medium">
                        Example output
                      </h3>
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                        {JSON.stringify(service.call.outputExample, null, 2)}
                      </pre>
                    </>
                  )}
                  <h3 className="mt-4 text-xs font-medium">
                    Inspect the unpaid HTTP 402 challenge
                  </h3>
                  <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                    {probeCommand(service)}
                  </pre>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    This command does not sign or pay. For a purchase, inspect
                    and approve in Console, then export a CLI checkout or use the SDK.
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {service.fixture && service.indexedBlock === "0"
                      ? "Simulated catalog snapshot"
                      : `Indexed at block ${service.indexedBlock}`}{" "}
                    · {new Date(service.indexedAt * 1000).toLocaleString()}
                  </p>
                </details>
                {onSelect ? (
                  <Button
                    disabled={selecting || busy}
                    className="mt-5 gap-2"
                    onClick={() => onSelect(service.name)}
                  >
                    Review service{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button asChild className="mt-5">
                    <Link
                      href={`/console?service=${encodeURIComponent(service.name)}`}
                    >
                      Review service{" "}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </article>
            ))}
          </div>
          {result.results.length === 0 && (
            <p className="mt-8 rounded-xl border p-6">
              No matching services in this catalog. Try another task or remove
              the price limit.
            </p>
          )}
          <details className="mt-8 text-sm text-muted-foreground">
            <summary className="cursor-pointer">Catalog source</summary>
            <p className="mt-2 break-all">
              {result.source.id} · {result.source.kind}
            </p>
            <p className="mt-1 break-all">
              Roots: {result.source.roots.join(", ")}
            </p>
            <p className="mt-1">
              Updated{" "}
              {new Date(result.source.updatedAt * 1000).toLocaleString()}.
              Search metadata may lag behind ENS; the Guard re-resolves before
              signing.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
