import { ArrowDown, Bot, Braces, Database, Search } from "lucide-react";

/** The catalog is shared by the search API and its SDK/MCP access paths. */
export function AgentDiscoveryFlow() {
  return <figure className="rounded-2xl border bg-white p-5 sm:p-7" aria-label="Public ENS records are indexed for keyword and semantic search; an agent accesses the search API through SDK or MCP">
    <div className="rounded-xl border bg-background p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><Database size={15} /> Onchain data / ENS</p>
      <p className="mt-2 break-all font-mono text-xs">service2.provider.ens402.eth</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{["Description", "Endpoint", "Call schema", "Payment terms"].map(text => <span key={text} className="rounded-md border bg-white px-2 py-1 text-xs text-muted-foreground">{text}</span>)}</div>
    </div>
    <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"><ArrowDown size={17} /> Index public records</div>
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Database size={17} className="text-primary" /> Service index</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/15 bg-white p-3 text-sm"><Search size={16} className="text-primary" /><span>Keyword + semantic search</span></div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">Descriptions → embeddings → ranked results</span><span className="shrink-0 font-medium text-primary">Search API</span></div>
    </div>
    <div className="relative mx-auto h-9 w-[65%]" aria-hidden="true"><div className="absolute left-1/2 top-0 h-4 border-l border-primary/40" /><div className="absolute inset-x-0 top-4 h-5 rounded-t-lg border-x border-t border-primary/40" /></div>
    <div className="mx-auto grid max-w-sm grid-cols-[1fr_auto_1fr] items-center gap-0">
      <div className="relative z-10 rounded-xl border border-primary/30 bg-blue-50 px-3 py-3 text-center"><Braces className="mx-auto text-primary" size={21} aria-hidden="true" /><p className="mt-1 text-sm font-semibold text-primary">SDK</p></div>
      <div className="relative px-5 text-primary"><span className="absolute inset-x-0 top-1/2 border-t-2 border-primary/40" aria-hidden="true" /><div className="relative rounded-2xl border border-primary/20 bg-white p-3"><Bot size={48} strokeWidth={1.5} aria-hidden="true" /></div></div>
      <div className="relative z-10 rounded-xl border border-primary/30 bg-blue-50 px-3 py-3 text-center"><Braces className="mx-auto text-primary" size={21} aria-hidden="true" /><p className="mt-1 text-sm font-semibold text-primary">MCP</p></div>
    </div>
    <p className="mt-3 text-center text-sm font-semibold">Your agent</p>
    <figcaption className="mt-4 text-center text-xs leading-6 text-muted-foreground">Two interfaces to the same search. Use our API or run your own indexer and API.</figcaption>
  </figure>;
}
