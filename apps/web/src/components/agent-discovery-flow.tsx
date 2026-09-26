import { ArrowDown, Bot, Braces, Database, Search, Terminal } from "lucide-react";

/** The catalog is shared by the search API and its SDK/CLI/MCP access paths. */
export function AgentDiscoveryFlow() {
  return <figure className="rounded-2xl border bg-white p-5 sm:p-7" aria-label="Public ENS records are indexed for keyword and semantic search; an agent accesses the search API through SDK, CLI or MCP">
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
    <div className="relative mx-auto h-9 w-[68%]" aria-hidden="true"><div className="absolute left-1/2 top-0 h-9 border-l border-primary/40" /><div className="absolute inset-x-0 top-4 h-5 rounded-t-lg border-x border-t border-primary/40" /></div>
    <div className="mx-auto grid max-w-md grid-cols-3 gap-3">
      {[{ label: "SDK", detail: "Your code", Icon: Braces }, { label: "CLI", detail: "Your terminal", Icon: Terminal }, { label: "MCP", detail: "Agent tools", Icon: Braces }].map(({ label, detail, Icon }) => <div key={label} className="rounded-xl border border-primary/30 bg-blue-50 px-2 py-3 text-center"><Icon className="mx-auto text-primary" size={22} aria-hidden="true" /><p className="mt-2 text-sm font-semibold text-primary">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>)}
    </div>
    <div className="relative mx-auto h-8 w-[68%]" aria-hidden="true"><div className="absolute inset-x-0 top-0 h-4 rounded-b-lg border-x border-b border-primary/40" /><div className="absolute left-1/2 top-0 h-8 border-l border-primary/40" /></div>
    <div className="flex items-center justify-center gap-3"><div className="rounded-2xl border border-primary/20 bg-white p-3 text-primary"><Bot size={40} strokeWidth={1.5} aria-hidden="true" /></div><p className="text-sm font-semibold">Your agent</p></div>
    <figcaption className="mt-4 text-center text-xs leading-6 text-muted-foreground">Three interfaces to the same search. Use our API or run your own indexer and API.</figcaption>
  </figure>;
}
