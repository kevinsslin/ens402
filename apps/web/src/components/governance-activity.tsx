"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

type Event = {
  eventName: string;
  txHash: string;
  blockNumber: number;
  observedAt: string;
  inputs: Record<string, string>;
};
type Page = { source: string; chainId: number; events: Event[] };
type Kind = "Registry" | "Resolver";

export function GovernanceActivity() {
  const [kind, setKind] = useState<Kind>("Registry");
  const [page, setPage] = useState<Page | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/governance/activity?kind=${kind}&limit=5`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Activity unavailable");
        return response.json() as Promise<Page>;
      })
      .then(result => {
        if (result.chainId !== 11155111 || !Array.isArray(result.events)) throw new Error("Invalid activity");
        setPage(result);
        setState("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setState("unavailable"); });
    return () => controller.abort();
  }, [kind, refresh]);

  function select(next: Kind) {
    setKind(next);
    setPage(null);
    setState("loading");
  }

  return <div className="rounded-2xl border bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow">Indexed on Ethereum Sepolia</p>
        <h3 className="mt-2 text-2xl font-medium">Namespace change history</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Curvegrid MultiBaas indexes the ENS402 root Registry and Resolver. This limited recent history does not include every provider service. Current rights and records come from a fresh ENS read.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setState("loading"); setRefresh(value => value + 1); }} className="rounded-lg border p-2 text-muted-foreground hover:text-foreground" aria-label="Refresh ENS activity"><RefreshCw size={17} /></button>
      </div>
    </div>
    <div className="mt-5 flex gap-2" role="group" aria-label="ENS contract activity">
      {(["Registry", "Resolver"] as const).map(item => <button key={item} type="button" onClick={() => select(item)} aria-pressed={kind === item} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${kind === item ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{item}</button>)}
    </div>
    <div className="mt-4 min-h-20" aria-live="polite">
      {state === "loading" && <p className="text-sm text-muted-foreground">Loading indexed activity…</p>}
      {state === "unavailable" && <p className="text-sm text-muted-foreground">The activity feed is unavailable. ENS resolution and payment verification still work independently.</p>}
      {state === "ready" && page?.events.length === 0 && <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">No events in the indexed window yet.</p>}
      {state === "ready" && page && page.events.length > 0 && <ol className="divide-y rounded-xl border">
        {page.events.map(event => <li key={`${event.txHash}:${event.blockNumber}:${event.eventName}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div><span className="font-medium">{event.eventName}</span><span className="ml-3 text-muted-foreground">Block {event.blockNumber.toLocaleString()}</span></div>
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://sepolia.etherscan.io/tx/${event.txHash}`} target="_blank" rel="noreferrer">Transaction <ExternalLink size={13} /></a>
        </li>)}
      </ol>}
    </div>
  </div>;
}
