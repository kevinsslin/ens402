import { ArrowRight, Database, Globe, Search, ShieldCheck } from "lucide-react";

/** Public source and replaceable search infrastructure remain distinct from payment verification. */
export function DiscoveryPipeline() {
  const steps = [
    { Icon: Globe, title: "Publish on ENS", detail: "Names, descriptions, call schema and payment terms.", label: "PUBLIC SOURCE" },
    { Icon: Database, title: "Rebuild a catalog", detail: "Anyone can index the supported roots. Envio is our reference implementation.", label: "REPLACEABLE INDEXER" },
    { Icon: Search, title: "Find a service", detail: "Keyword + semantic search through an API, SDK or MCP.", label: "DISCOVERY" },
    { Icon: ShieldCheck, title: "Verify before paying", detail: "Resolve ENS again. Compare HTTP 402. Screen the recipient.", label: "GUARD" },
  ];
  return <figure className="mt-8 rounded-2xl border bg-white p-5 sm:p-7" aria-label="ENS records flow through a replaceable indexer and search API to independent payment verification">
    <div className="grid gap-6 md:grid-cols-4 md:gap-8">{steps.map(({ Icon, title, detail, label }, i) => <div key={title} className="relative min-w-0">
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-4 flex items-center gap-2 text-primary"><Icon className="size-5" aria-hidden="true" /><h3 className="text-base font-medium text-foreground">{title}</h3></div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
      {i < 3 && <ArrowRight className="absolute -right-6 top-10 hidden size-4 text-primary/40 md:block" aria-hidden="true" />}
    </div>)}</div>
    <figcaption className="mt-6 border-t pt-4 text-xs leading-6 text-muted-foreground">ENS is the shared source of configuration. Search providers can differ; search results never authorize a payment.</figcaption>
  </figure>;
}
