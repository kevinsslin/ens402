import { ArrowDown, ArrowRight, Check, PenLine, ShieldCheck } from "lucide-react";

/** Payment recipient source remains explicit payment-record payTo until the holder model is implemented. */
export function PaymentVerificationFlow() {
  return <figure className="rounded-2xl border bg-white p-5 sm:p-8" aria-label="Resolve the service endpoint and payment terms from ENS, compare HTTP 402 and check policy before signing">
    <figcaption className="mb-6"><p className="text-sm font-semibold">One service name. Two sources to compare.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Goal: only request a signature when the API’s bill matches the service’s public terms and the buyer’s policy.</p></figcaption>
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-center"><p className="text-xs font-medium text-primary">RESOLVE ENS / SEPOLIA</p><p className="mt-2 break-all font-mono text-sm font-semibold">service2.provider.ens402.eth</p></div>
    <div className="flex justify-center py-3 text-primary"><ArrowDown size={20} /></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="rounded-xl border p-4"><p className="text-xs font-medium text-muted-foreground">ENDPOINT</p><p className="mt-2 font-mono text-sm">/api/service2</p></div>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><ArrowRight size={18} className="hidden sm:block" /><ArrowDown size={18} className="sm:hidden" /><span>Call API</span></div>
      <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium text-muted-foreground">HTTP RESPONSE</p><p className="mt-2 text-sm font-semibold">402 Payment Required</p></div>
    </div>
    <div className="my-5 grid grid-cols-2 gap-4 border-b pb-3 text-xs font-semibold uppercase tracking-wide"><p className="text-primary">ENS configuration</p><p className="text-right text-muted-foreground">HTTP 402 request</p></div>
    <div className="space-y-3">
      {[
        ["Recipient", "Service recipient", "payTo"],
        ["Payment network", "Base Sepolia", "eip155:84532"],
        ["Asset", "USDC contract", "Same token address"],
        ["Fixed price", "0.01 USDC", "10000 atomic units"],
      ].map(([label,left,right]) => <div key={label} className="rounded-lg bg-background px-3 py-3"><p className="mb-2 text-xs text-muted-foreground">{label}</p><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm"><span>{left}</span><span className="rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary" aria-label="Must match">=</span><span className="text-right">{right}</span></div></div>)}
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">USDC uses 6 decimals. Compare integer atomic amounts after checking the network and token.</p>
    <div className="flex justify-center py-3 text-primary"><ArrowDown size={20} /></div>
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4"><p className="flex items-center gap-2 font-medium"><ShieldCheck size={18} className="text-primary" /> Guard</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Terms match + approved buyer scope + spending limits + recipient screening.</p></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><p className="flex items-center gap-2 text-sm font-semibold"><Check size={17} /> All checks pass</p><p className="mt-2 flex items-center gap-2 text-sm"><PenLine size={16} /> Request wallet signature</p></div><div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900"><p className="text-sm font-semibold">A check fails</p><p className="mt-2 text-sm">Stop. Do not request a signature.</p></div></div>
  </figure>;
}
