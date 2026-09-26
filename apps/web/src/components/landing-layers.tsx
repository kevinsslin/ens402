import Link from "next/link";
import { AgentDiscoveryFlow } from "./agent-discovery-flow";
import { DiscoveryComparison } from "./discovery-comparison";
import { PaymentVerificationFlow } from "./payment-verification-flow";
import { ArrowRight, Check, LockKeyhole, Search, ShieldCheck, X } from "lucide-react";

const panel = "rounded-2xl border bg-white p-6 sm:p-8";
const step = "rounded-xl border bg-background px-5 py-4";

/** Explain each layer's purpose separately from the registry/resolver implementation diagram. */
export function LandingLayers() {
  return <div className="section-shell divide-y">
    <section id="discovery" className="py-12 sm:py-20">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div>
        <p className="eyebrow flex items-center gap-3"><Search size={18} /> 01 / Discover</p>
        <h2 className="mt-5 text-4xl leading-tight sm:text-5xl">A public context layer<br />for agent services.</h2>
        <ul aria-label="Discovery benefits" className="mt-5 flex flex-wrap gap-2">{["Publicly readable", "Verifiable source", "Traceable changes", "Rebuildable catalog"].map(label => <li key={label} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">{label}</li>)}</ul>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">Agents need to know what a service does, how to call it and what it costs. Publish that context under an ENS name, where anyone can read it, verify its source and follow its changes.</p>
        <p className="mt-4 leading-7 text-muted-foreground">As agent-to-agent services multiply, discovery should be rebuildable. Use our SDK or MCP, or run the open-source indexer and build your own search.</p>
        <Link href="/discover" className="mt-6 inline-flex items-center gap-2 font-medium text-primary">Explore services <ArrowRight size={17} /></Link>
      </div>
      <AgentDiscoveryFlow />
      </div>
      <DiscoveryComparison />
    </section>
    <section id="govern" className="grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-20 sm:py-24">
      <div>
        <p className="eyebrow flex items-center gap-3"><LockKeyhole size={18} /> 02 / Govern</p>
        <h2 className="mt-5 text-4xl leading-tight sm:text-5xl">Public settings.<br />Precisely scoped control.</h2>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">x402 defines how an API requests payment. ENS402 adds a public configuration and governance layer: native ENSv2 EAC decides which wallet can change each setting.</p>
        <p className="mt-4 leading-7 text-muted-foreground">Give everyday updates to Ops. Put payment terms under a Treasury Admin. Keep configuration independent of the server, so a stable service name can resolve to a new endpoint when infrastructure changes.</p>
        <Link href="/permissions" className="mt-6 inline-flex items-center gap-2 font-medium text-primary">See permissions <ArrowRight size={17} /></Link>
      </div>
      <div className={panel}>
        <p className="mb-5 text-sm font-medium">EAC enforces permissions on every write.</p>
        <div className="space-y-3">
          <div className={step}><p className="flex items-center justify-between gap-3 font-medium">Ops Wallet <Check className="text-primary" size={18} /></p><p className="mt-2 text-sm leading-6 text-muted-foreground">Hot wallet / EOA</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Endpoint · description · image · call instructions</p><code className="mt-3 inline-block rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">ROLE_SET_TEXT / operational keys</code></div>
          <div className={step}><p className="flex items-center justify-between gap-3 font-medium">Treasury Admin <Check className="text-primary" size={18} /></p><p className="mt-2 text-sm leading-6 text-muted-foreground">Payment terms · Demo: Safe multisig</p><code className="mt-3 inline-block rounded bg-violet-50 px-2 py-1 text-xs text-violet-800">ROLE_SET_TEXT / ens402.payment</code></div>
          <p className="flex items-center gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800"><X size={18} className="shrink-0" /> Ops tries to edit payment terms: transaction reverts.</p>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">One provider shares one resolver. Key grants cover its service bundles; separate teams can use separate resolvers. Provider Admin retains governance authority.</p>
      </div>
    </section>
    <section id="guard" className="grid items-start gap-10 py-16 lg:grid-cols-2 lg:gap-20 sm:py-24">
      <div>
        <p className="eyebrow flex items-center gap-3"><ShieldCheck size={18} /> 03 / Guard</p>
        <h2 className="mt-5 text-4xl leading-tight sm:text-5xl">Match the API’s bill to ENS.<br />Then request a signature.</h2>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">A compromised API can return a different recipient or a higher price. Before signing, the SDK compares the HTTP 402 request with freshly resolved ENS configuration.</p>
        <p className="mt-4 leading-7 text-muted-foreground">Check the recipient, network, token and fixed price, then apply buyer limits and recipient screening. If a server changes the recipient, stop before requesting a signature.</p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Our Console uses the same SDK. Bring your own signer; payments signed outside the SDK bypass these checks. Matching configuration does not prove service quality.</p>
        <Link href="/docs" className="mt-6 inline-flex items-center gap-2 font-medium text-primary">Integrate the SDK <ArrowRight size={17} /></Link>
      </div>
      <PaymentVerificationFlow />
    </section>
  </div>;
}
