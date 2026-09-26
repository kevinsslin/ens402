"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { formatUnits, parseUnits } from "viem";
import { discover, type DiscoveryService, type DiscoveryResponse } from "@ens402/sdk/discovery";
import { Button } from "@/components/ui/button";

function probeCommand(service: DiscoveryService) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return service.call.method === "POST"
    ? `curl --request POST --header 'Content-Type: application/json' --data ${quote(JSON.stringify(service.call.example ?? {}))} ${quote(service.endpoint)}`
    : `curl --include ${quote(service.endpoint)}`;
}

export function DiscoveryConsole() {
  const [query, setQuery] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      if (ceiling && !/^\d+(\.\d{1,6})?$/.test(ceiling)) throw new Error("Enter a USDC price with up to 6 decimal places.");
      setResult(await discover({ query, mode: "hybrid", pageSize: 20, ...(ceiling ? { maxPricePerRequestAtomic: parseUnits(ceiling, 6).toString() } : {}) }, { apiUrl: new URL("/api/discover", window.location.origin).href }));
    } catch (cause) { setError(cause instanceof Error && cause.message.includes("(503)") ? "Service search is temporarily unavailable. Please try again later." : cause instanceof Error ? cause.message : "Search is unavailable. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="section-shell py-12 sm:py-20">
    <p className="eyebrow">Discover</p>
    <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Find a service. Verify before paying.</h1>
    <p className="mt-4 max-w-2xl text-muted-foreground">Search public ENS service configuration. Choose a candidate, then check its current terms in the Console.</p>
    <form onSubmit={search} className="mt-8 grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-[1fr_180px_auto]">
      <label className="text-sm font-medium">What do you need?<input value={query} onChange={e => setQuery(e.target.value)} maxLength={500} placeholder="Weather forecast for Tokyo" className="mt-2 w-full rounded-lg border px-3 py-3 font-normal" /></label>
      <label className="text-sm font-medium">Max USDC / request<input value={ceiling} onChange={e => setCeiling(e.target.value)} inputMode="decimal" placeholder="No price limit" className="mt-2 w-full rounded-lg border px-3 py-3 font-normal" /></label>
      <Button type="submit" disabled={busy} className="self-end">{busy ? "Searching…" : "Search"}</Button>
      <p className="text-xs text-muted-foreground sm:col-span-3">Base Sepolia · USDC · A price filter never authorizes a payment.</p>
    </form>
    {error && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">{error}</p>}
    <div role="status" aria-live="polite" className="mt-6 text-sm text-muted-foreground">{result && `${result.results.length} ${result.results.length === 1 ? "candidate" : "candidates"} · ${result.semantic === "used" ? "Keyword + semantic search" : result.semantic === "unavailable" ? "Keyword search · semantic search unavailable" : "Keyword search"}`}</div>
    {result && <>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">{result.results.map(({ service, match }) => <article key={service.name} className="min-w-0 rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">{service.fixture ? "Demo fixture" : "Indexed service"}</span><span className="text-xs text-muted-foreground">{service.call.method}</span></div>
        <h2 className="mt-4 break-all text-xl font-medium">{service.name}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.description}</p>
        <p className="mt-4 font-medium">{formatUnits(BigInt(service.pricePerRequestAtomic), service.assetDecimals)} USDC <span className="text-sm font-normal text-muted-foreground">/ request</span></p>
        <p className="mt-2 text-xs text-muted-foreground">Matches: {match.map(m => ({ name: "ENS name", keyword: "keywords", semantic: "meaning" }[m])).join(", ") || "catalog filters"}. Relevance is not a safety rating.</p>
        <details className="mt-5 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">How to call it</summary><p className="mt-3 break-all font-mono text-xs">{service.call.method} {service.endpoint}</p>{service.call.inputSchema && <><h3 className="mt-4 text-xs font-medium">Input schema</h3><pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(service.call.inputSchema, null, 2)}</pre></>}{service.call.example && <><h3 className="mt-4 text-xs font-medium">Example input</h3><pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(service.call.example, null, 2)}</pre></>}{service.call.outputExample && <><h3 className="mt-4 text-xs font-medium">Example output</h3><pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(service.call.outputExample, null, 2)}</pre></>}
          <h3 className="mt-4 text-xs font-medium">Inspect the unpaid HTTP 402 challenge</h3><pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{probeCommand(service)}</pre>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">This command does not sign or pay. For a purchase, inspect and approve in Console, then use the approved ENS402 SDK flow.</p>
          <p className="mt-3 text-xs text-muted-foreground">{service.fixture && service.indexedBlock === "0" ? "Simulated catalog snapshot" : `Indexed at block ${service.indexedBlock}`} · {new Date(service.indexedAt * 1000).toLocaleString()}</p></details>
        <Button asChild variant="outline" className="mt-5"><Link href={`/console?service=${encodeURIComponent(service.name)}`}>Inspect current ENS terms</Link></Button>
      </article>)}</div>
      {result.results.length === 0 && <p className="mt-8 rounded-xl border p-6">No matching services. Try a broader query or remove the price limit.</p>}
      <details className="mt-8 text-sm text-muted-foreground"><summary className="cursor-pointer">Catalog source</summary><p className="mt-2 break-all">{result.source.id} · {result.source.kind}</p><p className="mt-1 break-all">Roots: {result.source.roots.join(", ")}</p><p className="mt-1">Updated {new Date(result.source.updatedAt * 1000).toLocaleString()}. Search metadata may lag behind ENS; the Guard re-resolves before signing.</p></details>
    </>}
  </section>;
}
