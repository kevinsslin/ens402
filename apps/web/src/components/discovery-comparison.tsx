import { Check, X } from "lucide-react";

function Mark({ included }: { included: boolean }) {
  return included
    ? <span className="inline-flex items-center justify-center text-emerald-700"><Check size={19} aria-hidden="true" /><span className="sr-only">Included</span></span>
    : <span className="inline-flex items-center justify-center text-muted-foreground"><X size={19} aria-hidden="true" /><span className="sr-only">Not provided by the referenced discovery specification</span></span>;
}

/** Compare documented capabilities, rather than competing products' use of ENS-specific technologies. */
export function DiscoveryComparison() {
  return <section aria-labelledby="comparison-title" className="pb-16 sm:pb-24">
    <div className="mb-6 max-w-3xl"><p className="eyebrow">Discovery, with an independent source</p><h2 id="comparison-title" className="mt-3 text-3xl sm:text-4xl">What changes when configuration is public?</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">Open discovery already exists. ENS402 adds a shared record of service configuration and checks whether an API’s payment request agrees with it.</p></div>
    <div className="relative overflow-x-auto rounded-2xl border bg-white" tabIndex={0} role="region" aria-label="Discovery capability comparison, scroll horizontally on small screens">
      <table className="w-full min-w-[580px] border-collapse text-sm">
        <caption className="sr-only">Documented discovery capabilities, checked September 27, 2026</caption>
        <thead><tr className="border-b"><th scope="col" className="p-5 text-left font-medium">Capability</th><th scope="col" className="bg-primary/5 p-5 text-center font-semibold text-primary">ENS402*</th><th scope="col" className="p-5 text-center font-medium">Bazaar</th><th scope="col" className="p-5 text-center font-medium">x402scan</th></tr></thead>
        <tbody>{[
          ["Publish descriptions and call metadata", true, true, true],
          ["Customize discovery and indexing", true, true, true],
          ["Rebuild published configuration and history from a shared onchain source", true, false, false],
          ["Check API payment changes against independently governed configuration", true, false, false],
        ].map(([label, ens, bazaar, scan]) => <tr key={String(label)} className="border-b last:border-0"><th scope="row" className="max-w-sm p-5 text-left font-normal leading-6">{label}</th><td className="bg-primary/5 p-5 text-center"><Mark included={Boolean(ens)} /></td><td className="p-5 text-center"><Mark included={Boolean(bazaar)} /></td><td className="p-5 text-center"><Mark included={Boolean(scan)} /></td></tr>)}</tbody>
      </table>
    </div>
    <div className="mt-4 grid gap-3 text-xs leading-6 text-muted-foreground sm:grid-cols-2"><p>✓ Included · × Not provided by the referenced discovery specification. Bazaar is an open extension; x402scan is open source. Both can be extended or combined with independent verification.</p><p>* ENS402 is a testnet prototype. Reconstruction covers configured ENS roots; hosted catalog setup remains pending. Payment mismatches can be detected, not every server compromise or incorrect API response.</p></div>
    <p className="mt-3 text-xs text-muted-foreground">Sources: <a className="underline underline-offset-4" href="https://github.com/coinbase/x402/blob/main/specs/extensions/bazaar.md">Bazaar specification</a> · <a className="underline underline-offset-4" href="https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md">x402scan discovery</a> · <a className="underline underline-offset-4" href="https://github.com/Merit-Systems/x402scan">x402scan source</a></p>
  </section>;
}
