import { ArrowDown, ArrowRight, Building2, Globe2, KeyRound, ScanLine, ShieldCheck, Wallet } from 'lucide-react';

export function ArchitectureDiagram() {
  return <figure className="mt-8 overflow-hidden rounded-2xl border bg-card" aria-label="ENS402 architecture: merchant permissions, public ENS records, agent checks, and Privy signing">
    <div className="border-b p-5 sm:p-7"><p className="eyebrow">Merchant / publish once, update with separate keys</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{[
      ['API operator', 'Change the API URL', 'Endpoint record only'],
      ['Treasury Admin', 'Manage payment terms', 'Payment record only'],
      ['Administrator', 'Grant or revoke these permissions', 'Native ENSv2 EAC'],
    ].map(([title, action, detail]) => <div key={title} className="rounded-lg border bg-background p-4"><KeyRound className="size-4 text-primary" aria-hidden="true"/><p className="mt-3 text-sm font-medium">{title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{action}</p><p className="mt-3 text-[11px] text-primary">{detail}</p></div>)}</div>
      <div className="flex justify-center py-4"><ArrowDown className="size-4 text-muted-foreground" aria-hidden="true"/></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-5"><div className="flex items-center gap-3"><Globe2 className="size-5 text-primary" aria-hidden="true"/><div><p className="font-mono text-sm">search.dataco.eth</p><p className="mt-1 text-xs text-muted-foreground">Public ENS records on Sepolia</p></div></div><p className="text-xs text-primary">API URL · recipient · token · network · status</p></div>
    </div>
    <div className="p-5 sm:p-7"><p className="eyebrow">Buyer / check every payment request</p><ol className="mt-5 grid gap-3 lg:grid-cols-5">{[
      { title: '1. Resolve', body: 'Read the service name and current API URL.', Icon: Globe2 },
      { title: '2. Verify', body: 'Compare the HTTP 402 with ENS and buyer approval.', Icon: ShieldCheck },
      { title: '3. Screen', body: 'Check the recipient using Intercepta risk evidence.', Icon: ScanLine },
      { title: '4. Sign', body: 'Privy checks its configured payment restrictions.', Icon: Wallet },
      { title: '5. Pay', body: 'Send the authorization through x402 to the service.', Icon: Building2 },
    ].map(({ title, body, Icon }, i) => <li key={title} className="relative rounded-lg border bg-background p-4"><div className="flex items-center justify-between"><Icon className="size-4 text-primary" aria-hidden="true"/>{i < 4 && <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true"/>}</div><p className="mt-4 text-sm font-medium">{title}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{body}</p></li>)}</ol>
      <div className="mt-4 rounded-lg border border-destructive/30 px-4 py-3 text-xs leading-6"><span className="font-medium text-destructive">Any mismatch or missing evidence → stop before signing.</span><span className="text-muted-foreground"> Discovery can come from Bazaar, a catalog, or an agent&apos;s own search.</span></div>
    </div><figcaption className="border-t px-5 py-4 text-xs leading-6 text-muted-foreground sm:px-7">Implemented flow with contract-fork, protocol and PostgreSQL integration tests. A controlled live ENS service, Privy credentials and funded testnet settlement are still required for live end-to-end validation.</figcaption>
  </figure>;
}
