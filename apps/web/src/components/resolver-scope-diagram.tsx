import { ArrowRight, Database, Layers3, Wallet } from "lucide-react";

/** Contract boxes mark the actual native EAC trust boundary, not just name groups. */
export function ResolverScopeDiagram() {
  return (
    <figure className="mt-7 rounded-2xl border bg-card p-5 sm:p-8" aria-label="Two services use separate resolvers to isolate their delegated writers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-medium">Separate writers. Separate resolvers.</h3>
        <span className="text-xs text-muted-foreground">Same provider. Separate writer scopes.</span>
      </div>
      <div className="mt-6 grid items-stretch gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)]">
        <section className="flex min-w-0 flex-col rounded-xl border border-dashed border-primary/30 bg-primary/[0.025] p-4">
          <p className="flex items-center gap-2 text-sm font-medium"><Layers3 className="size-4 text-primary" aria-hidden="true" />Provider Registry</p>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">provider.ens402.eth</p>
          <div className="mt-5 flex flex-1 flex-col justify-around gap-5">
            {[1, 2].map(number => <div key={number} className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">Name entry</p>
              <p className="mt-2 font-mono text-sm">service{number}</p>
              <p className="mt-2 text-xs text-muted-foreground">Owner: Service Admin {number}</p>
            </div>)}
          </div>
        </section>
        <div className="hidden flex-col justify-around text-xs text-muted-foreground md:flex" aria-hidden="true">
          {[1, 2].map(number => <div key={number} className="flex items-center gap-2"><span>resolver</span><ArrowRight className="size-4" /></div>)}
        </div>
        <div className="grid min-w-0 gap-5">
          {[1, 2].map(number => <section key={number} className="min-w-0 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-blue-900"><Database className="size-4" aria-hidden="true" />Separate Resolver {number}</p>
            <div className="mt-3 rounded-lg border border-blue-200 bg-card p-3 text-sm">
              <p className="font-medium">Service {number} records</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">Endpoint · Description · Picture · Payment terms</p>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Wallet className="size-4 text-blue-700" aria-hidden="true" /> Ops {number}
              <code className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">ROLE_SET_TEXT</code>
            </p>
            <p className="mt-2 text-xs leading-6 text-blue-900">Endpoint, description and avatar keys in Resolver {number} only.</p>
          </section>)}
        </div>
      </div>
      <figcaption className="mt-5 grid gap-3 text-sm leading-6 sm:grid-cols-2">
        <p><strong>Shared resolver:</strong> a key grant reaches every name on that instance.</p>
        <p><strong>Separate resolvers:</strong> Ops 1 has no write rights on Resolver 2.</p>
      </figcaption>
    </figure>
  );
}
