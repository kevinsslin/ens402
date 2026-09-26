import Image from "next/image";
import { Layers3 } from "lucide-react";
import { Check, X } from "lucide-react";

function Mark({ included }: { included: boolean }) {
  return included
    ? <span className="inline-flex items-center justify-center text-emerald-700"><Check size={19} aria-hidden="true" /><span className="sr-only">Included</span></span>
    : <span className="inline-flex items-center justify-center text-muted-foreground"><X size={19} aria-hidden="true" /><span className="sr-only">Not provided by the referenced discovery specification</span></span>;
}

/** Compare documented capabilities, rather than competing products' use of ENS-specific technologies. */
export function DiscoveryComparison() {
  return <section aria-labelledby="comparison-title" className="mt-9 sm:mt-12">
    <div className="mb-4"><h3 id="comparison-title" className="text-xl font-medium">Discovery at a glance</h3><p className="mt-2 text-sm text-muted-foreground">Shared discovery capabilities. A different source of truth.</p></div>
    <div className="relative overflow-x-auto rounded-2xl border bg-white" tabIndex={0} role="region" aria-label="Discovery capability comparison, scroll horizontally on small screens">
      <table className="w-full min-w-[580px] border-collapse text-sm">
        <caption className="sr-only">Documented discovery capabilities, checked September 27, 2026</caption>
        <thead><tr className="border-b"><th scope="col" className="p-5 text-left font-medium">Capability</th><th scope="col" className="bg-primary/5 p-5 text-center font-semibold text-primary"><span className="inline-flex items-center gap-2"><Layers3 size={21} aria-hidden="true" />ENS402*</span></th><th scope="col" className="p-5 text-center font-medium"><span className="flex flex-col items-center gap-1"><Image src="/brands/x402.svg" alt="x402" width={52} height={16} /><span>Bazaar</span></span></th><th scope="col" className="p-5 text-center font-medium"><span className="inline-flex items-center gap-2"><Image src="/brands/x402scan.svg" alt="" width={20} height={23} />x402scan</span></th></tr></thead>
        <tbody>{[
          ["Publish service descriptions", true, true, true],
          ["Customize discovery and indexing", true, true, true],
          ["Expose machine-readable call schemas", true, true, true],
          ["Rebuild published configuration and history from a shared onchain source", true, false, false],

        ].map(([label, ens, bazaar, scan]) => <tr key={String(label)} className="border-b last:border-0"><th scope="row" className="max-w-sm p-5 text-left font-normal leading-6">{label}</th><td className="bg-primary/5 p-5 text-center"><Mark included={Boolean(ens)} /></td><td className="p-5 text-center"><Mark included={Boolean(bazaar)} /></td><td className="p-5 text-center"><Mark included={Boolean(scan)} /></td></tr>)}</tbody>
      </table>
    </div>
    <div className="mt-4 grid gap-3 text-xs leading-6 text-muted-foreground sm:grid-cols-2"><p>✓ Included · × Not provided by the referenced discovery specification. Bazaar is an open extension; x402scan is open source. Both support custom discovery implementations.</p><p>* ENS402 is a testnet prototype. Reconstruction covers configured ENS roots; hosted catalog setup remains pending. Call schemas are published metadata, not automatic OpenAPI generation.</p></div>
    <p className="mt-3 text-xs text-muted-foreground">Bazaar is shown with the x402 mark. Sources: <a className="underline underline-offset-4" href="https://github.com/coinbase/x402/blob/main/specs/extensions/bazaar.md">Bazaar specification</a> · <a className="underline underline-offset-4" href="https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md">x402scan discovery</a> · <a className="underline underline-offset-4" href="https://github.com/Merit-Systems/x402scan">x402scan source</a></p>
  </section>;
}
